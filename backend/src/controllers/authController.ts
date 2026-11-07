import { Request, Response } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  getGoogleAuthUrl,
  getGmailAuthUrl,
  handleGoogleCallback,
  refreshAccessToken,
  getUserProfile,
  isAllowedRedirect,
  generateOAuthState,
  verifyOAuthState,
  storeOAuthCode,
  consumeOAuthCode,
  ALLOWED_MOBILE_REDIRECT,
} from '../services/authService';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { valkeyCache, valkeyClient } from '../config/valkey';

export async function devLogin(req: Request, res: Response) {
  try {
    const email = req.body.email || 'demo@lifepilot.ai';
    const name = req.body.name || 'Demo User';

    let user = await prisma.user.findUnique({
      where: { email },
      include: { preferences: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          googleId: `dev_${Date.now()}`,
          preferences: {
            create: {},
          },
        },
        include: { preferences: true },
      });
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    return sendSuccess(res, { user, accessToken, refreshToken }, 'Logged in successfully (Dev Mode)');
  } catch (error) {
    logger.error('Dev login error', error);
    return sendError(res, 'Failed to log in', 500);
  }
}

export function resolveGoogleRedirectUri(req: Request, _returnTo?: string): string {
  // Check if an explicit redirectUri parameter is provided and allowed
  const custom = typeof req.query.redirectUri === 'string' ? req.query.redirectUri : undefined;
  if (custom && isAllowedRedirect(custom)) {
    return custom;
  }

  // Always use configured GOOGLE_REDIRECT_URI as the authoritative redirect URI registered with Google Cloud
  return env.GOOGLE_REDIRECT_URI;
}

export async function googleLogin(req: Request, res: Response) {
  try {
    const rawReturnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
    const validatedReturnTo = rawReturnTo && isAllowedRedirect(rawReturnTo) ? rawReturnTo : env.FRONTEND_URL;
    const redirectUri = resolveGoogleRedirectUri(req, validatedReturnTo);
    const state = generateOAuthState(validatedReturnTo, redirectUri);
    const url = getGoogleAuthUrl(undefined, state, redirectUri);
    return res.redirect(url);
  } catch (error) {
    logger.error('Google login error', error);
    return sendError(res, 'Failed to initiate Google login', 500);
  }
}

export async function gmailConnect(req: Request, res: Response) {
  try {
    const rawReturnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
    const validatedReturnTo = rawReturnTo && isAllowedRedirect(rawReturnTo) ? rawReturnTo : env.FRONTEND_URL;
    const redirectUri = resolveGoogleRedirectUri(req, validatedReturnTo);
    const state = generateOAuthState(validatedReturnTo, redirectUri);
    const url = getGmailAuthUrl(state, redirectUri);
    return res.redirect(url);
  } catch (error) {
    return sendError(res, 'Failed to initiate Gmail connection', 500);
  }
}

export async function googleCallback(req: Request, res: Response) {
  const { code, error: oauthError, state } = req.query;

  // Resolve and securely validate the redirect destination
  const stateData = verifyOAuthState(typeof state === 'string' ? state : undefined);
  const targetDestination = stateData.returnTo;
  const redirectUri = stateData.redirectUri;
  const isMobile = targetDestination === ALLOWED_MOBILE_REDIRECT;

  // Handle OAuth errors from Google (e.g. user cancelled or denied access)
  if (oauthError) {
    const errorMsg = String(oauthError);
    logger.warn(`[OAuth] Google returned error: ${errorMsg}`);
    if (isMobile) {
      return res.redirect(`${ALLOWED_MOBILE_REDIRECT}?error=${encodeURIComponent(errorMsg)}`);
    }
    const baseTarget = targetDestination.replace(/\/+$/, '');
    return res.redirect(`${baseTarget}/auth/error?message=${encodeURIComponent(errorMsg)}`);
  }

  // Check for missing code
  if (!code || typeof code !== 'string') {
    if (isMobile) {
      return res.redirect(`${ALLOWED_MOBILE_REDIRECT}?error=missing_code`);
    }
    const baseTarget = targetDestination.replace(/\/+$/, '');
    return res.redirect(`${baseTarget}/auth/error?message=missing_code`);
  }

  try {
    // Exchange Google authorization code for user profile & JWT tokens
    const { user, accessToken, refreshToken } = await handleGoogleCallback(code, redirectUri);

    // Generate secure single-use authorization code for token exchange
    const exchangeCode = crypto.randomBytes(32).toString('hex');
    await storeOAuthCode(exchangeCode, {
      userId: user.id,
      accessToken,
      refreshToken,
    });

    // Mobile redirect: tokens are NEVER placed in the deep link URL
    if (isMobile) {
      return res.redirect(`${ALLOWED_MOBILE_REDIRECT}?code=${exchangeCode}`);
    }

    // Web redirect: preserve full backward compatibility with web client
    let redirectUrl: URL;
    if (targetDestination.includes('/gmail') || targetDestination.includes('/settings')) {
      redirectUrl = new URL(targetDestination);
    } else if (targetDestination.includes('/auth/callback')) {
      redirectUrl = new URL(targetDestination);
    } else {
      redirectUrl = new URL(`${targetDestination.replace(/\/+$/, '')}/auth/callback`);
    }
    redirectUrl.searchParams.set('accessToken', accessToken);
    redirectUrl.searchParams.set('refreshToken', refreshToken);
    redirectUrl.searchParams.set('code', exchangeCode);

    return res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('Google OAuth callback error', error);
    if (isMobile) {
      return res.redirect(`${ALLOWED_MOBILE_REDIRECT}?error=auth_failed`);
    }
    const baseTarget = targetDestination.replace(/\/+$/, '');
    return res.redirect(`${baseTarget}/auth/error?message=auth_failed`);
  }
}

export async function exchangeCode(req: Request, res: Response) {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return sendError(res, 'Authorization code is required', 400);
    }

    const payload = await consumeOAuthCode(code);
    if (!payload) {
      return sendError(res, 'Invalid or expired authorization code', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { preferences: true },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    return sendSuccess(
      res,
      {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        user,
      },
      'Authorization code exchanged successfully'
    );
  } catch (error) {
    logger.error('Error exchanging authorization code', error);
    return sendError(res, 'Failed to exchange authorization code', 500);
  }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, 'Refresh token required', 400);

    const result = await refreshAccessToken(refreshToken);
    return sendSuccess(res, result, 'Token refreshed');
  } catch (error) {
    return sendError(res, 'Invalid or expired refresh token', 401);
  }
}

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const profile = await getUserProfile(userId);
    if (!profile) return sendError(res, 'User not found', 404);
    return sendSuccess(res, profile);
  } catch (error) {
    return sendError(res, 'Failed to fetch profile', 500);
  }
}

export async function logout(req: AuthRequest, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      // Blacklist token in Valkey for 15 minutes (JWT expiry duration)
      await valkeyCache.blacklistToken(token, 15 * 60);
    }
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    return sendError(res, 'Logout failed', 500);
  }
}

export async function disconnectAccount(req: AuthRequest, res: Response) {
  try {
    const { provider } = req.params;
    const userId = req.user!.userId;

    await prisma.connectedAccount.updateMany({
      where: { userId, provider },
      data: { isActive: false },
    });

    return sendSuccess(res, null, `${provider} disconnected`);
  } catch (error) {
    return sendError(res, 'Failed to disconnect account', 500);
  }
}

// In-memory fallback for 6-digit Web pairing codes
interface PairingPayload {
  userId: string;
  email: string;
  createdAt: number;
}
const pairingCodeStore = new Map<string, { payload: PairingPayload; expiresAt: number }>();

export async function generatePairingCode(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return sendError(res, 'User not found', 404);

    // Generate random 6-digit numeric PIN
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const ttlSeconds = 600; // 10 minutes

    const payload: PairingPayload = {
      userId: user.id,
      email: user.email,
      createdAt: Date.now(),
    };

    pairingCodeStore.set(code, {
      payload,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    if (valkeyClient.status === 'ready') {
      try {
        await valkeyCache.set(`device_pair:${code}`, payload, ttlSeconds);
      } catch (err) {
        logger.warn('Failed to store pairing code in Valkey:', err);
      }
    }

    return sendSuccess(res, { code, expiresIn: ttlSeconds, userEmail: user.email }, 'Device pairing code generated');
  } catch (error) {
    logger.error('Generate pairing code error', error);
    return sendError(res, 'Failed to generate pairing code', 500);
  }
}

export async function consumePairingCode(req: Request, res: Response) {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return sendError(res, 'Pairing code is required', 400);
    }

    const cleanCode = code.trim().replace(/\s+/g, '');
    let payload: PairingPayload | null = null;

    const memoryEntry = pairingCodeStore.get(cleanCode);
    if (memoryEntry && Date.now() <= memoryEntry.expiresAt) {
      pairingCodeStore.delete(cleanCode);
      payload = memoryEntry.payload;
    }

    if (!payload && valkeyClient.status === 'ready') {
      try {
        const valkeyEntry = await valkeyCache.get<PairingPayload>(`device_pair:${cleanCode}`);
        if (valkeyEntry) {
          await valkeyCache.del(`device_pair:${cleanCode}`);
          payload = valkeyEntry;
        }
      } catch (err) {
        logger.warn('Failed reading pairing code from Valkey:', err);
      }
    }

    if (!payload) {
      return sendError(
        res,
        'Invalid or expired pairing code. Please generate a fresh 6-digit code from your web dashboard.',
        400
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { preferences: true },
    });

    if (!user) {
      return sendError(res, 'User associated with pairing code not found', 404);
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    return sendSuccess(
      res,
      { user, accessToken, refreshToken },
      'Device paired and authenticated successfully'
    );
  } catch (error) {
    logger.error('Consume pairing code error', error);
    return sendError(res, 'Failed to pair device', 500);
  }
}

export async function googleTokenLogin(req: Request, res: Response) {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return sendError(res, 'Google ID token is required', 400);
    }

    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const validAudiences = [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: validAudiences,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return sendError(res, 'Invalid Google ID token payload', 400);
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email },
      create: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        profilePicture: payload.picture || null,
        googleId: payload.sub,
        lastLoginAt: new Date(),
        preferences: {
          create: {},
        },
      },
      update: {
        name: payload.name || undefined,
        profilePicture: payload.picture || undefined,
        googleId: payload.sub,
        lastLoginAt: new Date(),
      },
      include: { preferences: true },
    });

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    return sendSuccess(
      res,
      { user, accessToken, refreshToken },
      'Signed in with Google successfully'
    );
  } catch (error: any) {
    logger.error('Google token verification error', error);
    return sendError(res, error.message || 'Invalid Google ID token', 401);
  }
}

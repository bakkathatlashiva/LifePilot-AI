import { Request, Response } from 'express';
import {
  getGoogleAuthUrl,
  getGmailAuthUrl,
  handleGoogleCallback,
  refreshAccessToken,
  getUserProfile,
} from '../services/authService';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { valkeyCache } from '../config/valkey';

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

export async function googleLogin(req: Request, res: Response) {
  try {
    const url = getGoogleAuthUrl();
    return res.redirect(url);
  } catch (error) {
    logger.error('Google login error', error);
    return sendError(res, 'Failed to initiate Google login', 500);
  }
}

export async function gmailConnect(req: Request, res: Response) {
  try {
    const url = getGmailAuthUrl();
    return res.redirect(url);
  } catch (error) {
    return sendError(res, 'Failed to initiate Gmail connection', 500);
  }
}

export async function googleCallback(req: Request, res: Response) {
  try {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(String(oauthError))}`);
    }

    if (!code || typeof code !== 'string') {
      return res.redirect(`${env.FRONTEND_URL}/auth/error?message=missing_code`);
    }

    const { user, accessToken, refreshToken } = await handleGoogleCallback(code);

    // Redirect to frontend with tokens (use secure cookie + short-lived query param)
    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('accessToken', accessToken);
    redirectUrl.searchParams.set('refreshToken', refreshToken);

    return res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('Google OAuth callback error', error);
    return res.redirect(`${env.FRONTEND_URL}/auth/error?message=auth_failed`);
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

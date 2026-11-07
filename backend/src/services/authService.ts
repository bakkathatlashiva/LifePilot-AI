import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { encrypt } from '../utils/encryption';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { syncGmail } from './gmail/gmailService';
import { valkeyCache, valkeyClient } from '../config/valkey';

export const ALLOWED_MOBILE_REDIRECT = 'lifepilot://auth/callback';

export function isAllowedRedirect(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;

  // Exact mobile custom scheme redirect
  if (urlStr === ALLOWED_MOBILE_REDIRECT) return true;

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const frontendUrl = new URL(env.FRONTEND_URL);
    if (parsed.origin === frontendUrl.origin) {
      return true;
    }

    // In development mode, allow localhost and private network LAN IPs
    if (env.NODE_ENV !== 'production') {
      const hostname = parsed.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.') ||
        hostname.includes('ngrok') ||
        hostname.includes('.dev') ||
        hostname.includes('.loca.lt')
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

interface OAuthStatePayload {
  returnTo: string;
  redirectUri?: string;
  nonce: string;
  createdAt: number;
}

export interface VerifiedOAuthState {
  returnTo: string;
  redirectUri?: string;
}

export function generateOAuthState(returnTo: string, redirectUri?: string): string {
  const safeReturnTo = isAllowedRedirect(returnTo) ? returnTo : env.FRONTEND_URL;
  const payload: OAuthStatePayload = {
    returnTo: safeReturnTo,
    redirectUri: redirectUri || undefined,
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: Date.now(),
  };
  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', env.JWT_SECRET).update(json).digest('hex');
  return `${Buffer.from(json).toString('base64url')}.${hmac}`;
}

export function verifyOAuthState(stateStr?: string): VerifiedOAuthState {
  const fallback: VerifiedOAuthState = { returnTo: env.FRONTEND_URL };
  if (!stateStr || typeof stateStr !== 'string') {
    return fallback;
  }

  // Check if state is in signed format <payload>.<hmac>
  if (stateStr.includes('.')) {
    const [b64, signature] = stateStr.split('.');
    if (b64 && signature) {
      try {
        const json = Buffer.from(b64, 'base64url').toString('utf8');
        const expectedHmac = crypto.createHmac('sha256', env.JWT_SECRET).update(json).digest('hex');

        if (
          signature.length === expectedHmac.length &&
          crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedHmac, 'hex'))
        ) {
          const payload = JSON.parse(json) as OAuthStatePayload;
          // Valid for 15 minutes
          if (Date.now() - payload.createdAt < 15 * 60 * 1000) {
            if (isAllowedRedirect(payload.returnTo)) {
              return {
                returnTo: payload.returnTo,
                redirectUri: payload.redirectUri,
              };
            }
          }
        }
      } catch (err) {
        logger.warn('Failed parsing signed OAuth state:', err);
      }
    }
  }

  // Fallback check for plain returnTo string (backward compatibility)
  if (isAllowedRedirect(stateStr)) {
    return { returnTo: stateStr };
  }

  return fallback;
}

interface CodePayload {
  userId: string;
  accessToken: string;
  refreshToken: string;
  createdAt: number;
}

const memoryCodeStore = new Map<string, { payload: CodePayload; expiresAt: number }>();

export async function storeOAuthCode(
  code: string,
  payload: { userId: string; accessToken: string; refreshToken: string }
): Promise<void> {
  const codePayload: CodePayload = {
    ...payload,
    createdAt: Date.now(),
  };

  const ttlSeconds = 120; // 2 minutes expiration
  memoryCodeStore.set(code, {
    payload: codePayload,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });

  if (valkeyClient.status === 'ready') {
    try {
      await valkeyCache.set(`oauth_code:${code}`, codePayload, ttlSeconds);
    } catch (err) {
      logger.warn('Failed to store code in Valkey, stored in memory fallback:', err);
    }
  }
}

export async function consumeOAuthCode(code: string): Promise<CodePayload | null> {
  // Check memory store first (single-use deletion)
  const memoryEntry = memoryCodeStore.get(code);
  memoryCodeStore.delete(code);

  if (memoryEntry && Date.now() <= memoryEntry.expiresAt) {
    if (valkeyClient.status === 'ready') {
      try {
        await valkeyCache.del(`oauth_code:${code}`);
      } catch {}
    }
    return memoryEntry.payload;
  }

  // Check Valkey if connected
  if (valkeyClient.status === 'ready') {
    try {
      const valkeyEntry = await valkeyCache.get<CodePayload>(`oauth_code:${code}`);
      if (valkeyEntry) {
        await valkeyCache.del(`oauth_code:${code}`); // single-use deletion!
        return valkeyEntry;
      }
    } catch (err) {
      logger.warn('Failed to read code from Valkey:', err);
    }
  }

  return null;
}

export function createOAuth2Client(customRedirectUri?: string): OAuth2Client {
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    customRedirectUri || env.GOOGLE_REDIRECT_URI
  );
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.send',
];

export const AUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

export function getGoogleAuthUrl(scopes: string[] = AUTH_SCOPES, state?: string, redirectUri?: string): string {
  const effectiveRedirectUri = redirectUri || env.GOOGLE_REDIRECT_URI;
  const client = createOAuth2Client(effectiveRedirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    redirect_uri: effectiveRedirectUri,
    ...(state ? { state } : {}),
  });
}

export function getGmailAuthUrl(state?: string, redirectUri?: string): string {
  const effectiveRedirectUri = redirectUri || env.GOOGLE_REDIRECT_URI;
  const client = createOAuth2Client(effectiveRedirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [...AUTH_SCOPES, ...GMAIL_SCOPES],
    prompt: 'consent',
    redirect_uri: effectiveRedirectUri,
    ...(state ? { state } : {}),
  });
}

export async function handleGoogleCallback(code: string, redirectUri?: string) {
  const effectiveRedirectUri = redirectUri || env.GOOGLE_REDIRECT_URI;
  const client = createOAuth2Client(effectiveRedirectUri);
  const { tokens } = await client.getToken({
    code,
    redirect_uri: effectiveRedirectUri,
  });
  client.setCredentials(tokens);

  // Get user profile
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email || !profile.id) throw new Error('Failed to get Google profile');

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email: profile.email },
    create: {
      email: profile.email,
      name: profile.name ?? profile.email,
      profilePicture: profile.picture ?? null,
      googleId: profile.id,
      lastLoginAt: new Date(),
      preferences: {
        create: {},
      },
    },
    update: {
      name: profile.name ?? undefined,
      profilePicture: profile.picture ?? undefined,
      googleId: profile.id,
      lastLoginAt: new Date(),
    },
  });

  // Store connected account (basic auth - no Gmail)
  const hasGmail = tokens.scope?.includes('gmail');
  if (tokens.access_token) {
    await prisma.connectedAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: 'google_auth' } },
      create: {
        userId: user.id,
        provider: 'google_auth',
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope,
      },
      update: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope,
        isActive: true,
      },
    });

    if (hasGmail) {
      await prisma.connectedAccount.upsert({
        where: { userId_provider: { userId: user.id, provider: 'google_gmail' } },
        create: {
          userId: user.id,
          provider: 'google_gmail',
          accessToken: encrypt(tokens.access_token),
          refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scope: tokens.scope,
        },
        update: {
          accessToken: encrypt(tokens.access_token),
          refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scope: tokens.scope,
          isActive: true,
        },
      });

      // Immediate real inbox sync in background
      syncGmail(user.id).catch((err) => logger.error('[Gmail Sync] Initial sync error:', err));
    }
  }

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

  logger.info(`User authenticated: ${user.email}`);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) throw new Error('User not found');

  const newAccessToken = signAccessToken({ userId: user.id, email: user.email });
  return { accessToken: newAccessToken, user };
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      profilePicture: true,
      createdAt: true,
      lastLoginAt: true,
      connectedAccounts: {
        select: { provider: true, isActive: true, tokenExpiry: true, scope: true },
      },
      preferences: true,
    },
  });
}

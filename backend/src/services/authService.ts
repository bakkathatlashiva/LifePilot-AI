import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { prisma } from '../config/database';
import { encrypt } from '../utils/encryption';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { syncGmail } from './gmail/gmailService';

export function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

export const AUTH_SCOPES = [
  'openid',
  'email',
  'profile',
];

export function getGoogleAuthUrl(scopes: string[] = AUTH_SCOPES): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

export function getGmailAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [...AUTH_SCOPES, ...GMAIL_SCOPES],
    prompt: 'consent',
  });
}

export async function handleGoogleCallback(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
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

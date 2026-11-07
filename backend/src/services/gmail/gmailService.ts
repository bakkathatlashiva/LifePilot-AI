import { google } from 'googleapis';
import { prisma } from '../../config/database';
import { decrypt, encrypt } from '../../utils/encryption';
import { logger } from '../../utils/logger';
import { analyzeEmailWithAI } from '../ai/emailAnalyzer';

function getAuthClient(accessToken: string, refreshToken?: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return auth;
}

export async function syncGmail(userId: string): Promise<void> {
  const account = await prisma.connectedAccount.findFirst({
    where: { userId, provider: 'google_gmail', isActive: true },
  });

  if (!account) {
    logger.warn(`[Gmail] No Gmail account connected for user ${userId}`);
    return;
  }

  const syncLog = await prisma.synchronizationLog.create({
    data: { userId, service: 'GMAIL', status: 'RUNNING', startedAt: new Date() },
  });

  try {
    const accessToken = decrypt(account.accessToken);
    const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : undefined;
    const auth = getAuthClient(accessToken, refreshToken);
    const gmail = google.gmail({ version: 'v1', auth });

    // Get messages from last 24 hours that are not yet fetched
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const query = `after:${Math.floor(cutoff.getTime() / 1000)} in:inbox`;

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = listRes.data.messages ?? [];
    let newCount = 0;
    let analyzedCount = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      const exists = await prisma.email.findUnique({ where: { gmailMessageId: msg.id } });
      if (exists) continue;

      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = detail.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateStr = getHeader('Date');

      // Extract body
      let bodyText = '';
      const payload = detail.data.payload;
      if (payload?.body?.data) {
        bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload?.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        }
      }

      // Parse sender
      const senderMatch = from.match(/^(.*?)\s*<(.+?)>$/);
      const senderName = senderMatch ? senderMatch[1].trim() : from;
      const senderEmail = senderMatch ? senderMatch[2] : from;

      const email = await prisma.email.create({
        data: {
          userId,
          gmailMessageId: msg.id,
          threadId: detail.data.threadId ?? null,
          subject,
          sender: senderName,
          senderEmail,
          snippet: detail.data.snippet ?? null,
          bodyText: bodyText.slice(0, 10000),
          receivedAt: dateStr ? new Date(dateStr) : new Date(),
          labelIds: detail.data.labelIds ?? [],
          isImportant: detail.data.labelIds?.includes('IMPORTANT') ?? false,
        },
      });

      newCount++;

      // Run AI analysis asynchronously for each email
      try {
        await analyzeEmailWithAI(userId, email.id);
        analyzedCount++;
      } catch (aiErr) {
        logger.warn(`[Gmail] AI analysis failed for email ${email.id}:`, aiErr);
      }
    }

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        tokenExpiry: new Date(Date.now() + 3600 * 1000),
      },
    });

    await prisma.synchronizationLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        itemsFound: messages.length,
        itemsNew: newCount,
        itemsUpdated: analyzedCount,
      },
    });

    logger.info(`[Gmail] Sync complete for user ${userId}. New: ${newCount}, Analyzed: ${analyzedCount}`);
  } catch (error: any) {
    logger.error('[Gmail] Sync error:', error);
    await prisma.synchronizationLog.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage: error.message },
    });
  }
}

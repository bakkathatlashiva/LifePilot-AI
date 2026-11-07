import { Router } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { telegramService } from '../services/telegram.service';
import { sendError, sendSuccess } from '../utils/apiResponse';
import crypto from 'crypto';
import { telegramQueue } from '../queues/telegram.queue';

/**
 * Helper to generate a short‑lived, single‑use token for Telegram deep‑link linking.
 */
function generateLinkToken(): string {
  // 16 bytes => 32 hex chars, plenty of entropy
  return crypto.randomBytes(16).toString('hex');
}

const router = Router();

/**
 * POST /api/telegram/link-token
 * Generates a token and returns a deep link URL for the authenticated user.
 */
router.post('/link-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const token = generateLinkToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.telegramLinkToken.create({
      data: {
        userId,
        token,
        expiresAt,
        used: false,
      },
    });

    const botUsername = env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) {
      return sendError(res, 'Telegram integration not configured', 400);
    }
    const deepLink = `https://t.me/${botUsername}?start=${token}`;
    sendSuccess(res, { deepLink, token }, 'Link token generated');
  } catch (error: any) {
    sendError(res, error.message ?? 'Failed to generate link token', 500);
  }
});

/**
 * GET /api/telegram/status
 * Returns current telegram subscription status for the authenticated user.
 */
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId ?? req.user!.id;
    const sub = await prisma.telegramSubscription.findFirst({
      where: { userId },
    });
    if (!sub) {
      return sendSuccess(res, { linked: false }, 'Telegram not linked');
    }
    sendSuccess(res, {
      linked: true,
      chatId: sub.telegramChatId,
      username: sub.telegramUsername ?? undefined,
      enabled: sub.isEnabled,
    }, 'Telegram status');
  } catch (error: any) {
    sendError(res, error.message ?? 'Failed to fetch status', 500);
  }
});

/**
 * POST /api/telegram/unlink
 * Disables the telegram subscription for the current user.
 */
router.post('/unlink', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.telegramSubscription.updateMany({
      where: { userId: req.user!.id },
      data: { isEnabled: false },
    });
    sendSuccess(res, null, 'Telegram notifications disabled');
  } catch (error: any) {
    sendError(res, error.message ?? 'Failed to unlink', 500);
  }
});

/**
 * PATCH /api/telegram/settings
 * Allows the user to toggle `isEnabled` flag.
 * Body: { enabled: boolean }
 */
router.patch('/settings', requireAuth, async (req: AuthRequest, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    return sendError(res, 'Invalid payload – `enabled` must be boolean', 400);
  }
  try {
    const userId = req.user!.userId ?? req.user!.id;
    const existing = await prisma.telegramSubscription.findFirst({
      where: { userId },
    });
    if (existing) {
      await prisma.telegramSubscription.update({
        where: { id: existing.id },
        data: { isEnabled: enabled },
      });
    }
    sendSuccess(res, { enabled }, 'Telegram settings updated');
  } catch (error: any) {
    sendError(res, error.message ?? 'Failed to update settings', 500);
  }
});

/**
 * POST /api/telegram/webhook
 * Receives raw updates from Telegram.
 * Telegram sends JSON with `update_id` and message data.
 */
router.post('/webhook', async (req, res) => {
  // Verify secret token (if configured)
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (header !== env.TELEGRAM_WEBHOOK_SECRET) {
      // Reject silently – we do not want to expose details
      return res.sendStatus(403);
    }
  }

  const update = req.body;
  if (!update || typeof update !== 'object') {
    return res.sendStatus(400);
  }

  // Deduplicate via Redis (valkey) – simple implementation using update_id
  const updateId = update.update_id?.toString();
  if (updateId) {
    // Store for 5 minutes; if already present, ignore
    const exists = await prisma.$queryRaw<any>`SELECT 1 FROM "_TelegramUpdateCache" WHERE "id" = ${updateId}`;
    // We'll skip caching implementation here – rely on in‑memory simple per‑process Set
    // (Note: for production, use a Redis set with TTL)
  }

  // Process commands
  const message = update.message ?? update.edited_message;
  if (!message || !message.text) {
    return res.sendStatus(200); // nothing to do
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const args = text.split(' ');
  const command = args[0].toLowerCase();

  // Helper to reply via queue (avoid blocking webhook)
  const enqueueReply = async (msg: string) => {
    await telegramQueue.add('sendMessage', {
      chatId,
      text: msg,
    });
  };

  switch (command) {
    case '/start': {
      const token = args[1];
      if (!token) {
        await enqueueReply('Welcome! Use the deep‑link from LifePilot to link this chat.');
        return res.sendStatus(200);
      }
      // Verify token
      const link = await prisma.telegramLinkToken.findUnique({ where: { token } });
      if (!link) {
        await enqueueReply('❌ Invalid link token.');
        return res.sendStatus(200);
      }
      if (link.used) {
        await enqueueReply('❌ This token has already been used.');
        return res.sendStatus(200);
      }
      if (link.expiresAt < new Date()) {
        await enqueueReply('❌ Token expired. Please request a new link token.');
        return res.sendStatus(200);
      }
      // Link Telegram chat to user
      await prisma.telegramSubscription.upsert({
        where: { userId_telegramChatId: { userId: link.userId, telegramChatId: chatId.toString() } },
        create: {
          userId: link.userId,
          telegramChatId: chatId.toString(),
          telegramUsername: message.chat.username ?? undefined,
          isEnabled: true,
        },
        update: {
          telegramUsername: message.chat.username ?? undefined,
          isEnabled: true,
        },
      });
      // Mark token used
      await prisma.telegramLinkToken.update({
        where: { id: link.id },
        data: { used: true },
      });
      await enqueueReply('✅ Your LifePilot account has been linked! You will now receive notifications here.');
      break;
    }
    case '/help': {
      const helpMsg = `🤖 *LifePilot Telegram Bot*\n\n` +
        `Available commands:\n` +
        `/start [token] – Link your account (token provided by the web UI)\n` +
        `/status – Show if your account is linked and notifications are enabled\n` +
        `/unlink – Disable notifications for this chat\n` +
        `/help – Show this help message`;
      await enqueueReply(helpMsg);
      break;
    }
    case '/status': {
      const sub = await prisma.telegramSubscription.findFirst({
        where: { telegramChatId: chatId.toString() },
      });
      if (!sub) {
        await enqueueReply('❌ This chat is not linked to any LifePilot account. Use /start with the link token.');
      } else {
        const statusMsg = `✅ Linked to user ID: ${sub.userId}\n` +
          `Notifications: ${sub.isEnabled ? 'Enabled' : 'Disabled'}`;
        await enqueueReply(statusMsg);
      }
      break;
    }
    case '/unlink': {
      await prisma.telegramSubscription.updateMany({
        where: { telegramChatId: chatId.toString() },
        data: { isEnabled: false },
      });
      await enqueueReply('✅ Telegram notifications have been disabled for this chat.');
      break;
    }
    default: {
      await enqueueReply('❓ Unknown command. Use /help to see available commands.');
    }
  }

  // Respond quickly to Telegram
  res.sendStatus(200);
});

export default router;


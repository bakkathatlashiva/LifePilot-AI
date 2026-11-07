import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendSuccess, sendError, sendPaginated } from '../utils/apiResponse';
import { env } from '../config/env';
import { sendTestEmailNotification } from '../services/notifications/gmailNotificationService';
import webpush from 'web-push';

const router = Router();
router.use(requireAuth);

// Get notifications
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);

    const where = {
      userId: req.user!.userId,
      ...(status && { status: status as any }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: parseInt(pageSize as string),
      }),
      prisma.notification.count({ where }),
    ]);

    return sendPaginated(res, notifications, total, parseInt(page as string), parseInt(pageSize as string));
  } catch (error) {
    return sendError(res, 'Failed to fetch notifications');
  }
});

// Mark as read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { readAt: new Date() },
    });
    return sendSuccess(res, null, 'Notification marked as read');
  } catch (error) {
    return sendError(res, 'Failed to update notification');
  }
});

// Dismiss notification
router.put('/:id/dismiss', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { status: 'DISMISSED', readAt: new Date() },
    });
    return sendSuccess(res, null, 'Notification dismissed');
  } catch (error) {
    return sendError(res, 'Failed to dismiss notification');
  }
});

// Snooze notification
router.put('/:id/snooze', async (req: AuthRequest, res: Response) => {
  try {
    const { snoozeMinutes = 30 } = req.body;
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: {
        status: 'SNOOZED',
        snoozedUntil: new Date(Date.now() + snoozeMinutes * 60 * 1000),
        scheduledAt: new Date(Date.now() + snoozeMinutes * 60 * 1000),
      },
    });
    return sendSuccess(res, null, `Snoozed for ${snoozeMinutes} minutes`);
  } catch (error) {
    return sendError(res, 'Failed to snooze notification');
  }
});

// Get VAPID public key for web push subscription
router.get('/vapid-key', async (req: AuthRequest, res: Response) => {
  if (!env.VAPID_PUBLIC_KEY) return sendError(res, 'Web push not configured', 503);
  return sendSuccess(res, { publicKey: env.VAPID_PUBLIC_KEY });
});

// Save web push subscription
router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  try {
    const subscription = req.body;
    await prisma.userPreference.update({
      where: { userId: req.user!.userId },
      data: { webPushSubscription: subscription, pushWebEnabled: true },
    });
    return sendSuccess(res, null, 'Web push subscription saved');
  } catch (error) {
    return sendError(res, 'Failed to save push subscription');
  }
});

// Save FCM token (Android)
router.post('/fcm-token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return sendError(res, 'token is required', 400);

    await prisma.userPreference.update({
      where: { userId: req.user!.userId },
      data: { fcmToken: token, pushAndroidEnabled: true },
    });

    return sendSuccess(res, null, 'FCM token saved');
  } catch (error) {
    return sendError(res, 'Failed to save FCM token');
  }
});

// Mark all read
router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return sendSuccess(res, null, 'All notifications marked as read');
  } catch (error) {
    return sendError(res, 'Failed to mark notifications as read');
  }
});

// Send test Gmail notification
router.post('/test-email', async (req: AuthRequest, res: Response) => {
  try {
    const result = await sendTestEmailNotification(req.user!.userId);
    if (!result.success) {
      return sendError(res, result.error || 'Failed to send test email', 400);
    }
    return sendSuccess(res, result, `Test notification successfully sent to ${result.recipientEmail}`);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to send test email', 500);
  }
});

// Check Gmail notification status & permissions
router.get('/gmail-status', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        userId: req.user!.userId,
        provider: { in: ['google_gmail', 'google_auth'] },
        isActive: true,
      },
      select: {
        provider: true,
        isActive: true,
        scope: true,
        tokenExpiry: true,
        updatedAt: true,
      },
    });

    const prefs = await prisma.userPreference.findUnique({
      where: { userId: req.user!.userId },
      select: {
        emailNotificationsEnabled: true,
        emailCategories: true,
        emailMinPriority: true,
      },
    });

    const isConnected = !!account;
    const hasSendScope = !!account?.scope?.includes('gmail.send');

    return sendSuccess(res, {
      isConnected,
      hasSendScope,
      account,
      preferences: prefs,
      authUrl: '/api/auth/google/gmail',
    });
  } catch (error: any) {
    return sendError(res, 'Failed to fetch Gmail notification status', 500);
  }
});

export default router;

import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/apiResponse';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const prefs = await prisma.userPreference.findUnique({
      where: { userId: req.user!.userId },
    });
    return sendSuccess(res, prefs);
  } catch (error) {
    return sendError(res, 'Failed to fetch preferences');
  }
});

async function handleUpdatePreferences(req: AuthRequest, res: Response) {
  try {
    const allowedFields = [
      'timezone', 'language', 'theme',
      'dailyBriefingTime', 'eveningBriefingTime',
      'notificationsEnabled', 'pushWebEnabled', 'pushAndroidEnabled',
      'phoneCallsEnabled', 'phoneNumber', 'preferredCallTime',
      'callCategories', 'erpMonitoringEnabled', 'gmailSyncEnabled',
      'gmailSyncInterval', 'defaultReminderTimes',
      'emailNotificationsEnabled', 'emailCategories', 'emailMinPriority',
      'smsNotificationsEnabled', 'smsMinPriority',
    ];

    const data = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowedFields.includes(k))
    );

    const prefs = await prisma.userPreference.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        ...data,
      },
      update: data,
    });

    return sendSuccess(res, prefs, 'Preferences updated');
  } catch (error) {
    return sendError(res, 'Failed to update preferences');
  }
}

router.put('/', handleUpdatePreferences);
router.patch('/', handleUpdatePreferences);

export default router;

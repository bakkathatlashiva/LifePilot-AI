import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendSuccess, sendError, sendPaginated } from '../utils/apiResponse';
import { syncGmail } from '../services/gmail/gmailService';
import { analyzeEmailWithAI } from '../services/ai/emailAnalyzer';
import { gmailQueue } from '../jobs/scheduler';

const router = Router();
router.use(requireAuth);

// Get Gmail sync status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId: req.user!.userId, provider: 'google_gmail' },
      select: { isActive: true, tokenExpiry: true, updatedAt: true },
    });

    const recentLogs = await prisma.synchronizationLog.findMany({
      where: { userId: req.user!.userId, service: 'GMAIL' },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    return sendSuccess(res, { account, recentLogs });
  } catch (error) {
    return sendError(res, 'Failed to fetch Gmail status');
  }
});

// Trigger manual sync
router.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    await gmailQueue.add('sync', { userId: req.user!.userId }, {
      jobId: `manual-gmail-${req.user!.userId}-${Date.now()}`,
    });
    return sendSuccess(res, null, 'Gmail sync queued');
  } catch (error) {
    return sendError(res, 'Failed to queue Gmail sync');
  }
});

// Demo emails endpoint disabled to ensure only real mailbox emails are displayed
router.post('/seed-demo-emails', async (req: AuthRequest, res: Response) => {
  return sendError(res, 'Demo email seeding is permanently disabled. Please connect your official Gmail account.', 400);
});

// Get emails
router.get('/emails', async (req: AuthRequest, res: Response) => {
  try {
    const { isImportant, aiCategory, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);

    const where = {
      userId: req.user!.userId,
      ...(isImportant !== undefined && { isImportant: isImportant === 'true' }),
      ...(aiCategory && { aiCategory: aiCategory as string }),
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: parseInt(pageSize as string),
        include: {
          suggestedTasks: {
            select: { id: true, isApproved: true, title: true },
          },
        },
      }),
      prisma.email.count({ where }),
    ]);

    return sendPaginated(res, emails, total, parseInt(page as string), parseInt(pageSize as string));
  } catch (error) {
    return sendError(res, 'Failed to fetch emails');
  }
});

// Get pending task suggestions
router.get('/suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const suggestions = await prisma.suggestedTask.findMany({
      where: { userId: req.user!.userId, isApproved: null },
      orderBy: { createdAt: 'desc' },
      include: { email: { select: { subject: true, sender: true, receivedAt: true, gmailMessageId: true } } },
    });
    return sendSuccess(res, suggestions);
  } catch (error) {
    return sendError(res, 'Failed to fetch suggestions');
  }
});

// Approve a suggestion → creates real task
router.post('/suggestions/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const suggestion = await prisma.suggestedTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!suggestion) return sendError(res, 'Suggestion not found', 404);
    if (suggestion.isApproved !== null) return sendError(res, 'Suggestion already actioned', 400);

    // Allow editing before approval
    const overrides = req.body ?? {};

    const task = await prisma.task.create({
      data: {
        userId: req.user!.userId,
        title: overrides.title ?? suggestion.title,
        description: overrides.description ?? suggestion.description,
        category: overrides.category ?? suggestion.category,
        source: 'GMAIL',
        deadline: overrides.deadline
          ? new Date(overrides.deadline)
          : suggestion.suggestedDueDate,
        priority: overrides.priority ?? suggestion.priority,
        status: 'UPCOMING',
        reminderSchedules: {
          create: [
            { userId: req.user!.userId, minutesBefore: 1440, channels: ['PUSH_ANDROID', 'PUSH_WEB'] },
            { userId: req.user!.userId, minutesBefore: 60, channels: ['PUSH_ANDROID', 'PUSH_WEB'] },
          ],
        },
      },
    });

    await prisma.suggestedTask.update({
      where: { id: suggestion.id },
      data: { isApproved: true, approvedAt: new Date(), taskId: task.id },
    });

    return sendSuccess(res, task, 'Task created from suggestion', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to approve suggestion');
  }
});

// Reject a suggestion
router.post('/suggestions/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const suggestion = await prisma.suggestedTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!suggestion) return sendError(res, 'Suggestion not found', 404);

    await prisma.suggestedTask.update({
      where: { id: suggestion.id },
      data: { isApproved: false, rejectedAt: new Date() },
    });

    return sendSuccess(res, null, 'Suggestion rejected');
  } catch (error) {
    return sendError(res, 'Failed to reject suggestion');
  }
});

export default router;

import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { saveERPSession, runERPSync, authenticateAndSyncWithCredentials } from '../services/erp/erpMonitor';
import { erpQueue } from '../jobs/scheduler';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { valkeyCache } from '../config/valkey';

const router = Router();
router.use(requireAuth);

// Get ERP connection status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const cacheKey = `valkey:erp:status:${userId}`;
    const cached = await valkeyCache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    const connection = await prisma.eRPConnection.findFirst({
      where: { userId },
      include: {
        _count: { select: { assignments: { where: { status: { in: ['AVAILABLE', 'CLOSED'] } } } } },
      },
    });

    const recentLogs = await prisma.synchronizationLog.findMany({
      where: { userId, service: 'ERP' },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    const payload = { connection, recentLogs };
    // Do not cache when RUNNING so polling detects completion immediately; otherwise cache for 5s
    if (connection?.lastSyncStatus !== 'RUNNING') {
      await valkeyCache.set(cacheKey, payload, 5);
    }

    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, 'Failed to fetch ERP status');
  }
});

// Connect with Student User ID & Password
router.post('/connect-credentials', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, erpUrl } = req.body;
    if (!username || !password) {
      return sendError(res, 'Username and password are required', 400);
    }

    const result = await authenticateAndSyncWithCredentials(
      req.user!.userId,
      username,
      password,
      erpUrl ?? env.AURORA_ERP_URL
    );

    return sendSuccess(res, result, `Connected to Aurora ERP! Synced ${result.assignmentCount} assignments.`, 200);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to authenticate with ERP', 400);
  }
});

// Save session cookies from frontend (alternative/advanced option)
router.post('/session', async (req: AuthRequest, res: Response) => {
  try {
    const { cookies, erpUrl } = req.body;
    if (!cookies || !Array.isArray(cookies)) {
      return sendError(res, 'cookies array is required', 400);
    }

    const connectionId = await saveERPSession(
      req.user!.userId,
      erpUrl ?? env.AURORA_ERP_URL,
      cookies
    );

    // Also trigger sync in background
    runERPSync(connectionId).catch((err) => logger.error('[ERP Sync] Error:', err));

    return sendSuccess(res, { connectionId }, 'ERP session saved. Sync started.', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to save ERP session');
  }
});

// Manually trigger sync
router.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    const connection = await prisma.eRPConnection.findFirst({
      where: { userId: req.user!.userId, isActive: true },
    });

    if (!connection) return sendError(res, 'No active ERP connection found', 404);

    // Invalidate cached status immediately so polling sees the fresh sync state instantly
    await valkeyCache.del(`valkey:erp:status:${req.user!.userId}`);

    // Direct background execution ensures immediate sync without duplicate queue processing
    runERPSync(connection.id).catch((err) => logger.error('[ERP Sync] Direct run error:', err));

    return sendSuccess(res, null, 'ERP sync initiated.');
  } catch (error) {
    return sendError(res, 'Failed to queue ERP sync');
  }
});

// Update monitoring interval
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { monitoringInterval } = req.body;
    if (!monitoringInterval || monitoringInterval < 1 || monitoringInterval > 1440) {
      return sendError(res, 'monitoringInterval must be between 1 and 1440 minutes', 400);
    }

    const connection = await prisma.eRPConnection.findFirst({
      where: { userId: req.user!.userId },
    });

    if (!connection) return sendError(res, 'No ERP connection found', 404);

    await prisma.eRPConnection.update({
      where: { id: connection.id },
      data: { monitoringInterval },
    });

    await valkeyCache.delPattern('valkey:erp:*');

    return sendSuccess(res, null, 'Monitoring interval updated');
  } catch (error) {
    return sendError(res, 'Failed to update settings');
  }
});

// Get assignments (Excludes UPCOMING by default: shows only Ongoing, Submitted, Evaluated)
router.get('/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = '1', pageSize = '50', includeUpcoming } = req.query;
    const userId = req.user!.userId;
    const cacheKey = `valkey:erp:assignments:${userId}:${status ?? 'ALL'}:${page}:${pageSize}:${includeUpcoming ?? 'false'}`;

    const cached = await valkeyCache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    const connection = await prisma.eRPConnection.findFirst({
      where: { userId },
    });

    if (!connection) return sendSuccess(res, { assignments: [], total: 0 });

    const where: any = {
      erpConnectionId: connection.id,
    };

    if (status && status !== 'ALL') {
      where.status = status;
    } else if (includeUpcoming !== 'true') {
      // Exclude UPCOMING: Only show ongoing, submitted, and evaluated
      where.status = { in: ['AVAILABLE', 'CLOSED'] };
    }

    const [assignments, total] = await Promise.all([
      prisma.eRPAssignment.findMany({
        where,
        orderBy: { closingDate: 'asc' },
        skip: (parseInt(page as string) - 1) * parseInt(pageSize as string),
        take: parseInt(pageSize as string),
        include: { history: { orderBy: { detectedAt: 'desc' }, take: 3 } },
      }),
      prisma.eRPAssignment.count({ where }),
    ]);

    const payload = { assignments, total, page: parseInt(page as string), pageSize: parseInt(pageSize as string) };
    await valkeyCache.set(cacheKey, payload, 60); // 60-second Valkey cache

    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, 'Failed to fetch assignments');
  }
});

// Get assignment history
router.get('/assignments/:id/history', async (req: AuthRequest, res: Response) => {
  try {
    const assignment = await prisma.eRPAssignment.findFirst({
      where: {
        id: req.params.id,
        erpConnection: { userId: req.user!.userId },
      },
      include: { history: { orderBy: { detectedAt: 'desc' } } },
    });

    if (!assignment) return sendError(res, 'Assignment not found', 404);
    return sendSuccess(res, assignment);
  } catch (error) {
    return sendError(res, 'Failed to fetch assignment history');
  }
});

export default router;

import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { runERPSync } from '../services/erp/erpMonitor';
import { syncGmail } from '../services/gmail/gmailService';
import { processScheduledNotifications, checkAndCreateDeadlineReminders } from '../services/notifications/notificationService';
import { prisma } from '../config/database';
import cron from 'node-cron';

// ─── Queues ───────────────────────────────
export const erpQueue = new Queue('erp-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const gmailQueue = new Queue('gmail-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

// ─── Workers ──────────────────────────────
export function startWorkers() {
  const erpWorker = new Worker(
    'erp-sync',
    async (job) => {
      logger.info(`[ERP Worker] Processing job ${job.id} for connection ${job.data.connectionId}`);
      await runERPSync(job.data.connectionId);
    },
    { connection: redis, concurrency: 2 }
  );

  const gmailWorker = new Worker(
    'gmail-sync',
    async (job) => {
      logger.info(`[Gmail Worker] Processing job ${job.id} for user ${job.data.userId}`);
      await syncGmail(job.data.userId);
    },
    { connection: redis, concurrency: 3 }
  );

  const notifWorker = new Worker(
    'notifications',
    async (job) => {
      if (job.name === 'process') await processScheduledNotifications();
      if (job.name === 'check-deadlines') await checkAndCreateDeadlineReminders();
    },
    { connection: redis, concurrency: 1 }
  );

  erpWorker.on('failed', (job, err) => logger.error(`[ERP Worker] Job ${job?.id} failed:`, err));
  gmailWorker.on('failed', (job, err) => logger.error(`[Gmail Worker] Job ${job?.id} failed:`, err));
  notifWorker.on('failed', (job, err) => logger.error(`[Notif Worker] Job ${job?.id} failed:`, err));

  logger.info('✅ BullMQ workers started');
}

// ─── Cron Jobs (schedule recurring checks) ─
export function startCronJobs() {
  // Process pending notifications every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    await notificationQueue.add('process', {});
  });

  // Check deadline reminders every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await notificationQueue.add('check-deadlines', {});
  });

  // Schedule automated ERP syncs: evaluates every minute against each connection's configured interval
  cron.schedule('* * * * *', async () => {
    try {
      const activeConnections = await prisma.eRPConnection.findMany({
        where: { isActive: true },
      });

      const now = Date.now();
      for (const conn of activeConnections) {
        if (conn.lastSyncStatus === 'RUNNING') continue;

        const intervalMinutes = conn.monitoringInterval || 30;
        const intervalMs = intervalMinutes * 60 * 1000;
        const lastSync = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() : 0;
        const elapsed = now - lastSync;

        if (elapsed >= intervalMs) {
          logger.info(
            `[ERP Auto-Sync Cron] Interval of ${intervalMinutes}m reached (elapsed: ${Math.round(elapsed / 60000)}m). Starting background sync for connection ${conn.id}...`
          );

          // Direct background execution guarantees immediate execution
          runERPSync(conn.id).catch((err) => {
            logger.error(`[ERP Auto-Sync Cron] Error syncing connection ${conn.id}:`, err);
          });
        }
      }
    } catch (err) {
      logger.error('[ERP Auto-Sync Cron] Check error:', err);
    }
  });

  // Schedule Gmail syncs
  cron.schedule('*/15 * * * *', async () => {
    const users = await prisma.connectedAccount.findMany({
      where: { provider: 'google_gmail', isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of users) {
      const prefs = await prisma.userPreference.findUnique({ where: { userId }, select: { gmailSyncEnabled: true } });
      if (prefs?.gmailSyncEnabled) {
        await gmailQueue.add('sync', { userId }, { jobId: `gmail-${userId}-${Date.now()}` });
      }
    }
  });

  // Update overdue task statuses daily at midnight
  cron.schedule('0 0 * * *', async () => {
    const now = new Date();
    const updated = await prisma.task.updateMany({
      where: {
        deadline: { lt: now },
        status: { in: ['UPCOMING', 'AVAILABLE', 'IN_PROGRESS'] },
      },
      data: { status: 'OVERDUE' },
    });
    logger.info(`[Cron] Marked ${updated.count} tasks as overdue`);
  });

  logger.info('✅ Cron jobs started');
}

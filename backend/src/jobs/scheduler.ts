import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { runERPSync } from '../services/erp/erpMonitor';
import { syncGmail } from '../services/gmail/gmailService';
import {
  processScheduledNotifications,
  checkAndCreateDeadlineReminders,
  checkAndSend12HourSmsReminders,
  checkAndSend24HourDeadlineSmsReminders,
  checkAndDispatchAllOngoingAndMissedAlerts,
} from '../services/notifications/notificationService';
import { prisma } from '../config/database';
import { emailQueue, emailWorker } from '../queues/email.queue';
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
erpQueue.on('error', (err) => logger.warn(`[ERP Queue] Redis warning: ${err.message}`));

export const gmailQueue = new Queue('gmail-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
gmailQueue.on('error', (err) => logger.warn(`[Gmail Queue] Redis warning: ${err.message}`));

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});
notificationQueue.on('error', (err) => logger.warn(`[Notif Queue] Redis warning: ${err.message}`));

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

  erpWorker.on('error', (err) => logger.warn(`[ERP Worker] Redis warning: ${err.message}`));
  gmailWorker.on('error', (err) => logger.warn(`[Gmail Worker] Redis warning: ${err.message}`));
  notifWorker.on('error', (err) => logger.warn(`[Notif Worker] Redis warning: ${err.message}`));

  erpWorker.on('failed', (job, err) => logger.error(`[ERP Worker] Job ${job?.id} failed:`, err));
  gmailWorker.on('failed', (job, err) => logger.error(`[Gmail Worker] Job ${job?.id} failed:`, err));
  notifWorker.on('failed', (job, err) => logger.error(`[Notif Worker] Job ${job?.id} failed:`, err));

  logger.info('✅ BullMQ workers started');
}

// ─── Cron Jobs (schedule recurring checks) ─
export function startCronJobs() {
  // Process pending notifications every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      await notificationQueue.add('process', {});
    } catch {
      processScheduledNotifications().catch((err) => logger.error('[Scheduler] Direct notification process error:', err));
    }
  });

  // Check deadline reminders & send automated email notifications every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await notificationQueue.add('check-deadlines', {});
    } catch {
      checkAndCreateDeadlineReminders().catch((err) => logger.error('[Scheduler] Direct deadline check error:', err));
    }
  });

  // Reclaim stale SMS jobs and update offline gateway statuses every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      const now = new Date();
      const staleThreshold = new Date(now.getTime() - 3 * 60 * 1000);
      const offlineThreshold = new Date(now.getTime() - 2 * 60 * 1000);

      // Reclaim jobs stuck in PROCESSING
      await prisma.smsJob.updateMany({
        where: {
          status: 'PROCESSING',
          claimedAt: { lt: staleThreshold },
        },
        data: {
          status: 'RETRYING',
          claimedBy: null,
          claimedAt: null,
          errorMessage: 'Stale job reclaimed by scheduler: gateway did not report result within 3 minutes',
        },
      });

      // Mark inactive gateways as OFFLINE
      await prisma.smsGatewayDevice.updateMany({
        where: {
          status: 'ONLINE',
          lastHeartbeatAt: { lt: offlineThreshold },
        },
        data: {
          status: 'OFFLINE',
        },
      });
    } catch (err) {
      logger.error('[Scheduler] SMS gateway maintenance error:', err);
    }
  });

  // 12-Hour Automated SMS Reminders for Open ERP Assignments (Runs hourly to detect 12h windows)
  cron.schedule('0 * * * *', async () => {
    checkAndSend12HourSmsReminders().catch((err) =>
      logger.error('[Scheduler] Error in 12h SMS reminder check:', err)
    );
  });

  // Automated Email & SMS alerts strictly for ONGOING and MISSED assignments (Runs every 15 minutes)
  cron.schedule('*/15 * * * *', async () => {
    checkAndDispatchAllOngoingAndMissedAlerts().catch((err) =>
      logger.error('[Scheduler] Error in automated ongoing/missed alerts:', err)
    );
  });

  // 24-Hour Urgent Deadline SMS Alerts (Runs every 15 minutes to guarantee immediate trigger)
  cron.schedule('*/15 * * * *', async () => {
    checkAndSend24HourDeadlineSmsReminders().catch((err) =>
      logger.error('[Scheduler] Error in 24h deadline SMS alert:', err)
    );
  });

  // Reset any stuck RUNNING statuses from previous server restarts
  prisma.eRPConnection.updateMany({
    where: { lastSyncStatus: 'RUNNING' },
    data: { lastSyncStatus: 'SUCCESS', lastSyncError: null },
  }).catch(() => {});

  // Initial checks and 24/7 background sync triggers on startup
  setTimeout(async () => {
    checkAndDispatchAllOngoingAndMissedAlerts().catch((err) =>
      logger.error('[Scheduler] Initial ongoing/missed alerts check failed:', err)
    );
    checkAndSend24HourDeadlineSmsReminders().catch((err) =>
      logger.error('[Scheduler] Initial 24h deadline SMS check failed:', err)
    );
    checkAndSend12HourSmsReminders().catch((err) =>
      logger.error('[Scheduler] Initial 12h SMS reminder check failed:', err)
    );

    // Initial 24/7 background ERP sync on boot
    try {
      const activeConnections = await prisma.eRPConnection.findMany({
        where: { isActive: true },
        select: { id: true, userId: true },
      });
      for (const conn of activeConnections) {
        logger.info(`[Startup 24/7] Triggering initial background ERP sync for ${conn.id}...`);
        runERPSync(conn.id).catch((err) =>
          logger.error(`[Startup 24/7] ERP sync error: ${err.message}`)
        );
      }
    } catch (e: any) {
      logger.error(`[Startup 24/7] ERP startup check error: ${e.message}`);
    }

    // Initial 24/7 background Gmail sync on boot
    try {
      const gmailUsers = await prisma.connectedAccount.findMany({
        where: { provider: { in: ['google_gmail', 'google_auth'] }, isActive: true },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const { userId } of gmailUsers) {
        logger.info(`[Startup 24/7] Triggering initial background Gmail sync for user ${userId}...`);
        syncGmail(userId).catch((err) =>
          logger.error(`[Startup 24/7] Gmail sync error: ${err.message}`)
        );
      }
    } catch (e: any) {
      logger.error(`[Startup 24/7] Gmail startup check error: ${e.message}`);
    }
  }, 4000);

  // 24/7 Automated ERP syncs: evaluates every minute against each connection's configured interval
  cron.schedule('* * * * *', async () => {
    try {
      const activeConnections = await prisma.eRPConnection.findMany({
        where: { isActive: true },
      });

      const now = Date.now();
      for (const conn of activeConnections) {
        // Reclaim stale RUNNING status (if in RUNNING state for > 3 minutes, server was likely reloaded)
        const isStaleRunning =
          conn.lastSyncStatus === 'RUNNING' &&
          conn.updatedAt &&
          now - new Date(conn.updatedAt).getTime() > 3 * 60 * 1000;

        if (conn.lastSyncStatus === 'RUNNING' && !isStaleRunning) {
          continue;
        }

        if (isStaleRunning) {
          logger.warn(`[ERP 24/7 Cron] Reclaiming stale RUNNING sync for connection ${conn.id}`);
          await prisma.eRPConnection.update({
            where: { id: conn.id },
            data: { lastSyncStatus: 'SUCCESS', lastSyncError: null },
          }).catch(() => {});
        }

        const intervalMinutes = conn.monitoringInterval || 5;
        const intervalMs = intervalMinutes * 60 * 1000;
        const lastSync = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() : 0;
        const elapsed = now - lastSync;

        if (elapsed >= intervalMs || isStaleRunning) {
          logger.info(
            `[ERP 24/7 Cron] Interval of ${intervalMinutes}m reached (elapsed: ${Math.round(elapsed / 60000)}m). Running 24/7 background sync for connection ${conn.id}...`
          );

          // Direct background execution guarantees 24/7 continuous monitoring across all pages
          runERPSync(conn.id).catch((err) => {
            logger.error(`[ERP 24/7 Cron] Error syncing connection ${conn.id}:`, err);
          });
        }
      }
    } catch (err) {
      logger.error('[ERP 24/7 Cron] Check error:', err);
    }
  });

  // 24/7 Automated Gmail syncs (runs every 5 minutes in background across all pages)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const users = await prisma.connectedAccount.findMany({
        where: { provider: { in: ['google_gmail', 'google_auth'] }, isActive: true },
        select: { userId: true },
        distinct: ['userId'],
      });

      for (const { userId } of users) {
        const prefs = await prisma.userPreference.findUnique({
          where: { userId },
          select: { gmailSyncEnabled: true },
        });

        // Default to enabled if no preference record is set
        if (prefs?.gmailSyncEnabled ?? true) {
          logger.info(`[Gmail 24/7 Cron] Triggering 24/7 background sync for user ${userId}...`);
          syncGmail(userId).catch((err) =>
            logger.error(`[Gmail 24/7 Cron] Error syncing user ${userId}:`, err)
          );
        }
      }
    } catch (err: any) {
      logger.error(`[Gmail 24/7 Cron] Error: ${err.message}`);
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

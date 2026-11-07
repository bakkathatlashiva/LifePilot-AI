import { Queue, Worker, Job } from 'bullmq';
import { valkeyClient } from '../config/valkey';
import { logger } from '../utils/logger';
import {
  sendGmailNotification,
  SendEmailOptions,
  SendEmailResult,
} from '../services/notifications/gmailNotificationService';

// --------------------------------------------------------------------------
// Queue definition (persisted in Redis / Valkey)
export const emailQueue = new Queue('email-notifications', {
  connection: valkeyClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

// --------------------------------------------------------------------------
// Worker – processes email jobs from the queue
export const emailWorker = new Worker(
  'email-notifications',
  async (job: Job<{ userId: string; options: SendEmailOptions }>) => {
    const { userId, options } = job.data;
    try {
      logger.info(`[Email Queue] Processing job ${job.id} for user ${userId} (${options.title})`);
      const result: SendEmailResult = await sendGmailNotification(userId, options);
      if (!result.success && result.reason === 'SEND_ERROR') {
        throw new Error(result.error ?? 'Failed to send email notification');
      }
      return result;
    } catch (err: any) {
      logger.error(`[Email Queue] Job ${job.id} failed:`, err.message);
      throw err; // triggers BullMQ automatic retry with exponential backoff
    }
  },
  {
    connection: valkeyClient,
    concurrency: 3,
  },
);

emailWorker.on('failed', (job, err) => {
  logger.error(`[Email Worker] Job ${job?.id} failed definitively:`, err.message);
});


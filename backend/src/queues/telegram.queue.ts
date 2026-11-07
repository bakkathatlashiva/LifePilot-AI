// backend/src/queues/telegram.queue.ts
import { Queue, Worker, Job } from 'bullmq';
import { telegramService } from '../services/telegram.service';
import { valkeyClient } from '../config/valkey';
import { logger } from '../utils/logger';

// --------------------------------------------------------------------------
// Queue definition (persisted in Redis / Valkey)
export const telegramQueue = new Queue('telegram-notifications', {
  connection: valkeyClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

// --------------------------------------------------------------------------
// Worker – processes jobs from the queue
new Worker(
  'telegram-notifications',
  async (job: Job<{ chatId: string; text: string; options?: any }>) => {
    const { chatId, text, options } = job.data;
    try {
      await telegramService.sendMessage(chatId, text, options);
      logger.info(`[Telegram] Message sent to chat ${chatId}`);
    } catch (err) {
      logger.error(`[Telegram] Failed to send message to ${chatId}:`, err);
      throw err; // let BullMQ handle retries
    }
  },
  {
    connection: valkeyClient,
    concurrency: 5,
  },
);

export { telegramQueue };


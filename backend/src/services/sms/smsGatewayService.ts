import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { SmsJobStatus, SmsGatewayStatus } from '@prisma/client';

export interface CreateSmsJobInput {
  recipientPhone: string;
  message: string;
  scheduledAt?: Date | string;
  simSlot?: number;
}

export interface RegisterGatewayInput {
  deviceId: string;
  deviceName: string;
  simOperator?: string;
  simSlot?: number;
  phoneNumber?: string;
  batteryLevel?: number;
  isCharging?: boolean;
}

export interface GatewayHeartbeatInput {
  batteryLevel?: number;
  isCharging?: boolean;
  simOperator?: string;
  status?: SmsGatewayStatus;
}

export interface JobResultInput {
  success: boolean;
  error?: string;
  deliveredAt?: Date | string;
  simSlotUsed?: number;
}

/**
 * Normalizes phone numbers to standard format (+[country][number] or digits)
 */
export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '').trim();
  // If 10-digit number without country code, default to Indian prefix (+91)
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (!cleaned.startsWith('+') && /^\d{11,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Creates a new SMS job in the queue
 */
export async function createSmsJob(userId: string, data: CreateSmsJobInput) {
  const normalizedPhone = normalizePhoneNumber(data.recipientPhone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error('Invalid recipient phone number');
  }

  const message = data.message?.trim();
  if (!message || message.length === 0) {
    throw new Error('Message content cannot be empty');
  }
  if (message.length > 1600) {
    throw new Error('Message content exceeds maximum length of 1600 characters');
  }

  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : new Date();

  const job = await prisma.smsJob.create({
    data: {
      userId,
      recipientPhone: normalizedPhone,
      message,
      scheduledAt,
      status: SmsJobStatus.PENDING,
      simSlot: data.simSlot ?? 0,
      retryCount: 0,
      maxRetries: 3,
    },
  });

  logger.info(`[SMS Gateway] Created SMS job ${job.id} for user ${userId} to ${normalizedPhone}`);
  return job;
}

/**
 * List SMS jobs for a user with optional status filter and pagination
 */
export async function listUserSmsJobs(
  userId: string,
  options: { status?: SmsJobStatus; page?: number; pageSize?: number } = {}
) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: any = { userId };
  if (options.status) {
    where.status = options.status;
  }

  const [jobs, total] = await Promise.all([
    prisma.smsJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        gatewayDevice: {
          select: {
            deviceId: true,
            deviceName: true,
            simOperator: true,
          },
        },
      },
    }),
    prisma.smsJob.count({ where }),
  ]);

  return { jobs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Retrieve a specific SMS job by ID
 */
export async function getSmsJobById(userId: string, jobId: string) {
  const job = await prisma.smsJob.findFirst({
    where: { id: jobId, userId },
    include: {
      gatewayDevice: {
        select: {
          deviceId: true,
          deviceName: true,
          simOperator: true,
          status: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error('SMS job not found');
  }
  return job;
}

/**
 * Cancel a pending or retrying SMS job
 */
export async function cancelSmsJob(userId: string, jobId: string) {
  const job = await prisma.smsJob.findFirst({
    where: { id: jobId, userId },
  });

  if (!job) {
    throw new Error('SMS job not found');
  }

  if (job.status === SmsJobStatus.SENT) {
    throw new Error('Cannot cancel an SMS that has already been sent');
  }

  if (job.status === SmsJobStatus.CANCELLED) {
    return job;
  }

  const updated = await prisma.smsJob.update({
    where: { id: jobId },
    data: {
      status: SmsJobStatus.CANCELLED,
      errorMessage: 'Cancelled by user',
    },
  });

  logger.info(`[SMS Gateway] Job ${jobId} cancelled by user ${userId}`);
  return updated;
}

/**
 * Registers an Android device as the user's SMS gateway
 */
export async function registerGatewayDevice(userId: string, data: RegisterGatewayInput) {
  if (!data.deviceId) throw new Error('Device ID is required');

  const device = await prisma.smsGatewayDevice.upsert({
    where: { deviceId: data.deviceId },
    create: {
      userId,
      deviceId: data.deviceId,
      deviceName: data.deviceName || 'Android SMS Gateway',
      simOperator: data.simOperator,
      simSlot: data.simSlot ?? 0,
      phoneNumber: data.phoneNumber,
      batteryLevel: data.batteryLevel ?? null,
      isCharging: data.isCharging ?? false,
      status: SmsGatewayStatus.ONLINE,
      lastHeartbeatAt: new Date(),
      isDefault: true,
    },
    update: {
      userId, // reassign to current authenticated user if needed
      deviceName: data.deviceName || undefined,
      simOperator: data.simOperator || undefined,
      simSlot: data.simSlot !== undefined ? data.simSlot : undefined,
      phoneNumber: data.phoneNumber || undefined,
      batteryLevel: data.batteryLevel !== undefined ? data.batteryLevel : undefined,
      isCharging: data.isCharging !== undefined ? data.isCharging : undefined,
      status: SmsGatewayStatus.ONLINE,
      lastHeartbeatAt: new Date(),
    },
  });

  // Enable SMS gateway preference for the user automatically
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, smsGatewayEnabled: true },
    update: { smsGatewayEnabled: true },
  });

  logger.info(`[SMS Gateway] Device registered: ${device.deviceName} (${device.deviceId}) for user ${userId}`);
  return device;
}

/**
 * Updates heartbeat and status for a registered gateway device
 */
export async function gatewayHeartbeat(userId: string, deviceId: string, data: GatewayHeartbeatInput) {
  const device = await prisma.smsGatewayDevice.findFirst({
    where: { deviceId, userId },
  });

  if (!device) {
    throw new Error('Gateway device not found. Please register first.');
  }

  const updated = await prisma.smsGatewayDevice.update({
    where: { id: device.id },
    data: {
      lastHeartbeatAt: new Date(),
      status: data.status || SmsGatewayStatus.ONLINE,
      batteryLevel: data.batteryLevel !== undefined ? data.batteryLevel : undefined,
      isCharging: data.isCharging !== undefined ? data.isCharging : undefined,
      simOperator: data.simOperator || undefined,
    },
  });

  return updated;
}

/**
 * Atomically claims eligible pending/retrying SMS jobs for an authenticated gateway device
 */
export async function claimEligibleSmsJobs(userId: string, deviceId: string, limit: number = 5) {
  const now = new Date();
  const maxJobBatch = Math.min(20, Math.max(1, limit));

  // 1. Recover stale jobs: any job stuck in PROCESSING for > 3 minutes is reset to RETRYING
  const staleThreshold = new Date(now.getTime() - 3 * 60 * 1000);
  await prisma.smsJob.updateMany({
    where: {
      userId,
      status: SmsJobStatus.PROCESSING,
      claimedAt: { lt: staleThreshold },
    },
    data: {
      status: SmsJobStatus.RETRYING,
      claimedBy: null,
      claimedAt: null,
      errorMessage: 'Job timed out while processing on gateway device; resetting for retry',
    },
  });

  // 2. Perform atomic claiming inside a transaction
  const claimedJobs = await prisma.$transaction(async (tx) => {
    // Select eligible jobs matching user, status PENDING or RETRYING, and scheduled time <= now
    const eligibleJobs = await tx.smsJob.findMany({
      where: {
        userId,
        status: { in: [SmsJobStatus.PENDING, SmsJobStatus.RETRYING] },
        scheduledAt: { lte: now },
        retryCount: { lt: 3 },
      },
      orderBy: { scheduledAt: 'asc' },
      take: maxJobBatch,
    });

    if (eligibleJobs.length === 0) {
      return [];
    }

    const jobIds = eligibleJobs.map((j) => j.id);

    // Atomically claim the batch
    await tx.smsJob.updateMany({
      where: {
        id: { in: jobIds },
        status: { in: [SmsJobStatus.PENDING, SmsJobStatus.RETRYING] },
      },
      data: {
        status: SmsJobStatus.PROCESSING,
        claimedBy: deviceId,
        claimedAt: now,
      },
    });

    // Return the updated claimed records
    return tx.smsJob.findMany({
      where: { id: { in: jobIds } },
      orderBy: { scheduledAt: 'asc' },
    });
  });

  if (claimedJobs.length > 0) {
    logger.info(`[SMS Gateway] Device ${deviceId} claimed ${claimedJobs.length} job(s)`);
  }

  return claimedJobs;
}

/**
 * Reports the execution result of an SMS job from the Android gateway device
 */
export async function reportJobResult(
  userId: string,
  deviceId: string,
  jobId: string,
  data: JobResultInput
) {
  const job = await prisma.smsJob.findFirst({
    where: { id: jobId, userId },
  });

  if (!job) {
    throw new Error('SMS job not found');
  }

  // If already cancelled or sent, do not overwrite
  if (job.status === SmsJobStatus.CANCELLED) {
    return job;
  }

  const now = new Date();

  if (data.success) {
    const updated = await prisma.smsJob.update({
      where: { id: jobId },
      data: {
        status: SmsJobStatus.SENT,
        sentAt: now,
        deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : now,
        errorMessage: null,
      },
    });

    // Increment gateway success stats
    await prisma.smsGatewayDevice.updateMany({
      where: { deviceId },
      data: {
        smsSentCount: { increment: 1 },
        lastHeartbeatAt: now,
      },
    });

    logger.info(`[SMS Gateway] Job ${jobId} successfully sent via device ${deviceId}`);
    return updated;
  } else {
    const nextRetry = job.retryCount + 1;
    const isFatal = nextRetry >= job.maxRetries;

    const updated = await prisma.smsJob.update({
      where: { id: jobId },
      data: {
        status: isFatal ? SmsJobStatus.FAILED : SmsJobStatus.RETRYING,
        retryCount: nextRetry,
        errorMessage: data.error || 'Failed to send SMS via SIM card',
        claimedBy: null,
        claimedAt: null,
      },
    });

    // Increment gateway failure stats
    await prisma.smsGatewayDevice.updateMany({
      where: { deviceId },
      data: {
        smsFailedCount: { increment: 1 },
        lastHeartbeatAt: now,
      },
    });

    logger.warn(`[SMS Gateway] Job ${jobId} failed (attempt ${nextRetry}/${job.maxRetries}): ${data.error}`);
    return updated;
  }
}

/**
 * Returns gateway device status and queue overview for the user
 */
export async function getGatewayStatus(userId: string) {
  const devices = await prisma.smsGatewayDevice.findMany({
    where: { userId },
    orderBy: { lastHeartbeatAt: 'desc' },
  });

  // Device is considered online if last heartbeat was within past 90 seconds
  const now = Date.now();
  const devicesWithFreshness = devices.map((d) => {
    const elapsedSeconds = Math.round((now - new Date(d.lastHeartbeatAt).getTime()) / 1000);
    const isRecentlyActive = elapsedSeconds <= 90;
    return {
      ...d,
      isOnline: isRecentlyActive && d.status === SmsGatewayStatus.ONLINE,
      secondsSinceLastHeartbeat: elapsedSeconds,
    };
  });

  // Calculate queue statistics
  const [pendingCount, processingCount, sentCount, failedCount] = await Promise.all([
    prisma.smsJob.count({ where: { userId, status: SmsJobStatus.PENDING } }),
    prisma.smsJob.count({ where: { userId, status: SmsJobStatus.PROCESSING } }),
    prisma.smsJob.count({ where: { userId, status: SmsJobStatus.SENT } }),
    prisma.smsJob.count({ where: { userId, status: SmsJobStatus.FAILED } }),
  ]);

  const activeGateway = devicesWithFreshness.find((d) => d.isOnline) || devicesWithFreshness[0] || null;

  return {
    hasGateway: devices.length > 0,
    activeGateway,
    devices: devicesWithFreshness,
    queueStats: {
      pending: pendingCount,
      processing: processingCount,
      sent: sentCount,
      failed: failedCount,
      total: pendingCount + processingCount + sentCount + failedCount,
    },
    // Aliases for frontend compatibility
    isConfigured: devices.length > 0,
    isOnline: !!activeGateway?.isOnline,
    device: activeGateway,
    queue: {
      pending: pendingCount,
      processing: processingCount,
      sentToday: sentCount,
      failed: failedCount,
    },
  };
}


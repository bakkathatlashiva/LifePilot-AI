import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginated } from '../utils/apiResponse';
import {
  createSmsJob,
  listUserSmsJobs,
  getSmsJobById,
  cancelSmsJob,
  registerGatewayDevice,
  gatewayHeartbeat,
  claimEligibleSmsJobs,
  reportJobResult,
  getGatewayStatus,
} from '../services/sms/smsGatewayService';
import { SmsJobStatus } from '@prisma/client';

const router = Router();
router.use(requireAuth);

// ──────────────────────────────────────────────
// USER ENDPOINTS (Web & Mobile clients)
// ──────────────────────────────────────────────

/**
 * POST /api/sms/jobs
 * Create a new SMS job
 */
router.post('/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const { recipientPhone, message, scheduledAt, simSlot } = req.body;
    if (!recipientPhone || !message) {
      return sendError(res, 'Recipient phone number and message content are required', 400);
    }

    const job = await createSmsJob(req.user!.userId, {
      recipientPhone,
      message,
      scheduledAt,
      simSlot: simSlot !== undefined ? Number(simSlot) : undefined,
    });

    return sendSuccess(res, job, 'SMS job created successfully', 201);
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to create SMS job', 400);
  }
});

/**
 * GET /api/sms/jobs
 * List SMS jobs belonging to the authenticated user
 */
router.get('/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = '1', pageSize = '20' } = req.query;
    const result = await listUserSmsJobs(req.user!.userId, {
      status: status ? (String(status).toUpperCase() as SmsJobStatus) : undefined,
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
    });

    return sendPaginated(
      res,
      result.jobs,
      result.total,
      result.page,
      result.pageSize
    );
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to retrieve SMS jobs', 500);
  }
});

/**
 * GET /api/sms/jobs/:id
 * Retrieve a specific SMS job
 */
router.get('/jobs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const job = await getSmsJobById(req.user!.userId, req.params.id);
    return sendSuccess(res, job, 'SMS job retrieved successfully');
  } catch (err: any) {
    return sendError(res, err.message || 'SMS job not found', 404);
  }
});

/**
 * DELETE /api/sms/jobs/:id
 * Cancel a pending SMS job
 */
router.delete('/jobs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const job = await cancelSmsJob(req.user!.userId, req.params.id);
    return sendSuccess(res, job, 'SMS job cancelled successfully');
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to cancel SMS job', 400);
  }
});

/**
 * GET /api/sms/gateway/status
 * Get the current gateway status and queue overview for the user
 */
router.get('/gateway/status', async (req: AuthRequest, res: Response) => {
  try {
    const status = await getGatewayStatus(req.user!.userId);
    return sendSuccess(res, status, 'Gateway status retrieved successfully');
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to retrieve gateway status', 500);
  }
});

// ──────────────────────────────────────────────
// GATEWAY DEVICE ENDPOINTS (Android phone)
// ──────────────────────────────────────────────

/**
 * POST /api/sms/gateway/register
 * Register the Android phone as the active SMS gateway
 */
router.post('/gateway/register', async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, deviceName, simOperator, simSlot, phoneNumber, batteryLevel, isCharging } = req.body;
    if (!deviceId) {
      return sendError(res, 'deviceId is required to register gateway', 400);
    }

    const device = await registerGatewayDevice(req.user!.userId, {
      deviceId,
      deviceName: deviceName || 'Personal Android Gateway',
      simOperator,
      simSlot: simSlot !== undefined ? Number(simSlot) : 0,
      phoneNumber,
      batteryLevel: batteryLevel !== undefined ? Number(batteryLevel) : undefined,
      isCharging: Boolean(isCharging),
    });

    return sendSuccess(res, device, 'Gateway device registered successfully');
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to register gateway device', 400);
  }
});

/**
 * POST /api/sms/gateway/heartbeat
 * Update gateway online status, battery, and signal
 */
router.post('/gateway/heartbeat', async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, batteryLevel, isCharging, simOperator, status } = req.body;
    if (!deviceId) {
      return sendError(res, 'deviceId is required for heartbeat', 400);
    }

    const device = await gatewayHeartbeat(req.user!.userId, deviceId, {
      batteryLevel: batteryLevel !== undefined ? Number(batteryLevel) : undefined,
      isCharging: isCharging !== undefined ? Boolean(isCharging) : undefined,
      simOperator,
      status,
    });

    return sendSuccess(res, device, 'Heartbeat recorded');
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to record heartbeat', 400);
  }
});

/**
 * GET /api/sms/gateway/jobs
 * Allow the authenticated gateway to claim eligible jobs
 */
router.get('/gateway/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const deviceId = req.query.deviceId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;

    if (!deviceId) {
      return sendError(res, 'deviceId query parameter is required to claim jobs', 400);
    }

    const jobs = await claimEligibleSmsJobs(req.user!.userId, deviceId, limit);
    return sendSuccess(res, jobs, `Claimed ${jobs.length} SMS job(s)`);
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to claim SMS jobs', 500);
  }
});

/**
 * POST /api/sms/gateway/jobs/:id/result
 * Receive the SMS sending result from Android
 */
router.post('/gateway/jobs/:id/result', async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, success, error, deliveredAt, simSlotUsed } = req.body;
    if (!deviceId) {
      return sendError(res, 'deviceId is required', 400);
    }
    if (success === undefined) {
      return sendError(res, 'success boolean status is required', 400);
    }

    const job = await reportJobResult(req.user!.userId, deviceId, req.params.id, {
      success: Boolean(success),
      error,
      deliveredAt,
      simSlotUsed: simSlotUsed !== undefined ? Number(simSlotUsed) : undefined,
    });

    return sendSuccess(res, job, 'Job result recorded successfully');
  } catch (err: any) {
    return sendError(res, err.message || 'Failed to record job result', 400);
  }
});

export default router;

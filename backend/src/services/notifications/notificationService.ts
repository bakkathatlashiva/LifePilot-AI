import webpush from "web-push";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { logger } from "../../utils/logger";
import { telegramQueue } from '../../queues/telegram.queue';
import { NotificationType } from "../types";

// Configure VAPID
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${env.VAPID_EMAIL}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
}

export async function notifyNewAssignment(
  userId: string,
  assignmentId: string,
  title: string,
  deadline?: Date | null,
): Promise<void> {
  const deadlineStr = deadline
    ? `Due: ${deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : "No deadline set";

  await prisma.notification.create({
    data: {
      userId,
      type: "IN_APP",
      status: "PENDING",
      title: "📚 New Assignment Published",
      body: `${title}\n${deadlineStr}`,
      data: { assignmentId, type: "NEW_ASSIGNMENT" },
      scheduledAt: new Date(),
    },
  });

  // Push notification
  await sendPushNotification(userId, {
    title: "📚 New Assignment",
    body: `${title} — ${deadlineStr}`,
    data: { type: "NEW_ASSIGNMENT", assignmentId },
  });
}

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  if (!prefs?.notificationsEnabled) return;

  // Web push
  if (prefs.pushWebEnabled && prefs.webPushSubscription) {
    try {
      await webpush.sendNotification(
        prefs.webPushSubscription as unknown as webpush.PushSubscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          data: payload.data,
        }),
      );
    } catch (err: any) {
      logger.warn(`[WebPush] Failed for user ${userId}:`, err.message);
    }
  }

  // FCM (Android)
  if (prefs.pushAndroidEnabled && prefs.fcmToken) {
    await sendFCMNotification(prefs.fcmToken, payload);
  }
}

async function sendFCMNotification(
  token: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (
    !env.FIREBASE_PROJECT_ID ||
    !env.FIREBASE_CLIENT_EMAIL ||
    !env.FIREBASE_PRIVATE_KEY
  ) {
    logger.warn("[FCM] Firebase credentials not configured");
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin") as any;
    const initializeApp = admin.initializeApp.bind(admin);
    const cert = admin.credential.cert.bind(admin.credential);
    const getApps = () => admin.apps as unknown[];
    const getMessaging = () => admin.messaging();

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }

    await getMessaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data
        ? Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
          )
        : {},
      android: {
        priority: "high",
        notification: { channelId: "lifepilot_default", sound: "default" },
      },
    });

    logger.info(`[FCM] Notification sent to token ...${token.slice(-8)}`);
  } catch (error: any) {
    logger.error("[FCM] Send error:", error.message);
  }
}

export async function processScheduledNotifications(): Promise<void> {
  const now = new Date();
  const due = await prisma.notification.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      retryCount: { lt: 3 },
    },
    take: 50,
    include: { user: { select: { id: true, email: true } } },
  });

  for (const notif of due) {
    try {
      await sendPushNotification(notif.userId, {
        title: notif.title,
        body: notif.body,
        data: (notif.data as Record<string, unknown>) ?? {},
      });

      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: "SENT", sentAt: now },
      });
    } catch (err: any) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          retryCount: { increment: 1 },
          status: notif.retryCount + 1 >= 3 ? "FAILED" : "PENDING",
          failureReason: err.message,
        },
      });
    }
  }
}

export async function checkAndCreateDeadlineReminders(): Promise<void> {
  const now = new Date();

  // Find tasks with active reminder schedules whose reminders are due
  const schedules = await prisma.reminderSchedule.findMany({
    where: { isActive: true },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          userId: true,
        },
      },
    },
  });

  for (const schedule of schedules) {
    const task = schedule.task;
    if (!task.deadline) continue;
    if (task.status === "COMPLETED" || task.status === "CANCELLED") continue;

    const reminderTime = new Date(
      task.deadline.getTime() - schedule.minutesBefore * 60 * 1000,
    );

    // Check if we're within a 5-minute window of the scheduled reminder time
    const diffMs = reminderTime.getTime() - now.getTime();
    if (diffMs > -5 * 60 * 1000 && diffMs < 5 * 60 * 1000) {
      // Check we haven't sent this reminder already
      if (
        schedule.lastFiredAt &&
        Math.abs(schedule.lastFiredAt.getTime() - now.getTime()) <
          10 * 60 * 1000
      ) {
        continue;
      }

      const hoursLabel =
        schedule.minutesBefore >= 1440
          ? `${schedule.minutesBefore / 1440} day(s)`
          : schedule.minutesBefore >= 60
            ? `${schedule.minutesBefore / 60} hour(s)`
            : `${schedule.minutesBefore} minutes`;

      await prisma.notification.create({
        data: {
          userId: task.userId,
          taskId: task.id,
          type: "IN_APP",
          status: "PENDING",
          title: `⏰ Deadline in ${hoursLabel}`,
          body: `"${task.title}" is due ${hoursLabel} from now`,
          data: { type: "DEADLINE_REMINDER", taskId: task.id },
          scheduledAt: now,
        },
      });

      await sendPushNotification(task.userId, {
        title: `⏰ Deadline in ${hoursLabel}`,
        body: `"${task.title}" is due ${hoursLabel} from now`,
        data: { type: "DEADLINE_REMINDER", taskId: task.id },
      });

      await prisma.reminderSchedule.update({
        where: { id: schedule.id },
        data: { lastFiredAt: now },
      });
    }
  }
}

import webpush from "web-push";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { telegramQueue } from '../../queues/telegram.queue';
import { emailQueue } from '../../queues/email.queue';
import { sendGmailNotification, SendEmailOptions } from './gmailNotificationService';
import { createSmsJob } from '../sms/smsGatewayService';
import { NotificationType } from "../types";

// Configure VAPID
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${env.VAPID_EMAIL}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
}

export async function getUserRecipientPhone(userId: string): Promise<string | null> {
  const prefs = await prisma.userPreference.findUnique({
    where: { userId },
    select: { phoneNumber: true, smsNotificationsEnabled: true },
  });
  if (prefs?.phoneNumber) return prefs.phoneNumber;
  const device = await prisma.smsGatewayDevice.findFirst({
    where: { userId, status: 'ONLINE' },
    select: { phoneNumber: true },
  });
  return device?.phoneNumber || null;
}

export async function dispatchEmailNotification(
  userId: string,
  options: SendEmailOptions
): Promise<void> {
  try {
    await emailQueue.add('notification', { userId, options });
  } catch (qErr: any) {
    logger.warn(`[Notification] Queue add failed, sending directly via Gmail: ${qErr.message}`);
    sendGmailNotification(userId, options).catch((err) =>
      logger.error(`[Notification] Direct Gmail send failed: ${err.message}`)
    );
  }
}

export async function dispatchSmsNotification(
  userId: string,
  recipientPhone: string,
  message: string
): Promise<void> {
  try {
    const prefs = await prisma.userPreference.findUnique({
      where: { userId },
      select: { smsNotificationsEnabled: true, smsGatewayEnabled: true },
    });

    if (prefs && !prefs.smsNotificationsEnabled) {
      return;
    }

    await createSmsJob(userId, {
      recipientPhone,
      message,
    });
  } catch (err: any) {
    logger.error(`[Notification] Failed to queue SMS notification: ${err.message}`);
  }
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

  // Gmail notification (automatic delivery)
  await dispatchEmailNotification(userId, {
    taskId: assignmentId,
    title: `📚 New Assignment: ${title}`,
    message: `A new assignment "${title}" has been published with deadline ${deadlineStr}.`,
    category: 'COLLEGE_ASSIGNMENT',
    priority: 'MEDIUM',
    dueDate: deadline ?? undefined,
    actionUrl: `${env.FRONTEND_URL}/tasks`,
    actionText: 'View Assignment',
    details: [
      { label: 'Title', value: title },
      { label: 'Deadline', value: deadlineStr },
    ],
  });

  // Automated SMS dispatch to user phone inbox via SIM Gateway
  try {
    const recipientPhone = await getUserRecipientPhone(userId);
    if (recipientPhone) {
      const smsBody = `LifePilot Alert: New assignment opened: "${title}". ${deadlineStr}. Submit on time!`;
      await dispatchSmsNotification(userId, recipientPhone, smsBody);
      logger.info(`[Notification] Dispatched open assignment SMS to ${recipientPhone} for ${title}`);
    }
  } catch (smsErr: any) {
    logger.warn(`[Notification] Failed to dispatch SMS for new assignment: ${smsErr.message}`);
  }
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

  // 1. Find tasks with active reminder schedules whose reminders are due
  const schedules = await prisma.reminderSchedule.findMany({
    where: { isActive: true },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          category: true,
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

    // Check if we're within a 10-minute window of the scheduled reminder time
    const diffMs = reminderTime.getTime() - now.getTime();
    if (diffMs > -10 * 60 * 1000 && diffMs < 10 * 60 * 1000) {
      if (
        schedule.lastFiredAt &&
        Math.abs(schedule.lastFiredAt.getTime() - now.getTime()) < 60 * 60 * 1000
      ) {
        continue;
      }

      const hoursLabel =
        schedule.minutesBefore >= 1440
          ? `${Math.round(schedule.minutesBefore / 1440)} day(s)`
          : schedule.minutesBefore >= 60
            ? `${Math.round(schedule.minutesBefore / 60)} hour(s)`
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

      // Dispatch Gmail notification
      await dispatchEmailNotification(task.userId, {
        taskId: task.id,
        title: `⏰ Deadline in ${hoursLabel}: ${task.title}`,
        message: `Your task "${task.title}" is due ${hoursLabel} from now (${task.deadline.toLocaleString('en-IN')}). Please review and ensure completion.`,
        category: task.category,
        priority: 'HIGH',
        dueDate: task.deadline,
        actionUrl: `${env.FRONTEND_URL}/tasks`,
        actionText: 'View Task in LifePilot',
        details: [
          { label: 'Task Title', value: task.title },
          { label: 'Time Remaining', value: hoursLabel },
          { label: 'Due Date', value: task.deadline.toLocaleString('en-IN') },
        ],
      });

      await prisma.reminderSchedule.update({
        where: { id: schedule.id },
        data: { lastFiredAt: now },
      });
    }
  }

  // 2. Direct 24-hour deadline sweep: Catch any tasks due soon that haven't received an email in 12h
  const upcomingIn24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const urgentTasks = await prisma.task.findMany({
    where: {
      deadline: { gt: now, lte: upcomingIn24h },
      status: { in: ['AVAILABLE', 'IN_PROGRESS', 'UPCOMING'] },
    },
    take: 20,
  });

  for (const ut of urgentTasks) {
    if (!ut.deadline) continue;
    const existingRecent = await prisma.notification.findFirst({
      where: {
        userId: ut.userId,
        taskId: ut.id,
        type: 'EMAIL',
        createdAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
    });

    if (!existingRecent) {
      const hoursLeft = Math.max(1, Math.round((ut.deadline.getTime() - now.getTime()) / (60 * 60 * 1000)));
      await dispatchEmailNotification(ut.userId, {
        taskId: ut.id,
        title: `⏰ Deadline in ~${hoursLeft}h: ${ut.title}`,
        message: `Your task "${ut.title}" is due in approximately ${hoursLeft} hour(s) (${ut.deadline.toLocaleString('en-IN')}).`,
        category: ut.category,
        priority: 'HIGH',
        dueDate: ut.deadline,
        actionUrl: `${env.FRONTEND_URL}/tasks`,
        actionText: 'Open LifePilot Tasks',
        details: [
          { label: 'Task Title', value: ut.title },
          { label: 'Category', value: ut.category },
          { label: 'Due Date', value: ut.deadline.toLocaleString('en-IN') },
        ],
      });
    }
  }

  // 3. Automated Overdue Alert Sweep: Notify on overdue tasks (once every 24h)
  const overdueTasks = await prisma.task.findMany({
    where: {
      deadline: { lt: now },
      status: { in: ['AVAILABLE', 'IN_PROGRESS', 'UPCOMING', 'OVERDUE'] },
    },
    take: 20,
  });

  for (const ot of overdueTasks) {
    if (!ot.deadline) continue;
    const existingOverdue = await prisma.notification.findFirst({
      where: {
        userId: ot.userId,
        taskId: ot.id,
        type: 'EMAIL',
        title: { contains: 'Overdue' },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    if (!existingOverdue) {
      await dispatchEmailNotification(ot.userId, {
        taskId: ot.id,
        title: `⚠️ Overdue Task Alert: ${ot.title}`,
        message: `Your task "${ot.title}" was due on ${ot.deadline.toLocaleString('en-IN')} and is currently overdue. Please submit or complete it as soon as possible.`,
        category: ot.category,
        priority: 'CRITICAL',
        dueDate: ot.deadline,
        actionUrl: `${env.FRONTEND_URL}/tasks`,
        actionText: 'Review Overdue Task',
        details: [
          { label: 'Task Title', value: ot.title },
          { label: 'Due Date (Passed)', value: ot.deadline.toLocaleString('en-IN') },
          { label: 'Status', value: 'Overdue' },
        ],
      });
    }
  }

  // 4. Automated Exam Reminders: Notify students of exams within the next 3 days (once per 24h)
  const examWindow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const upcomingExams = await prisma.exam.findMany({
    where: {
      examDate: { gt: now, lte: examWindow },
      isCompleted: false,
    },
    include: { subject: { select: { name: true, code: true } } },
    take: 10,
  });

  for (const exam of upcomingExams) {
    const existingExamNotif = await prisma.notification.findFirst({
      where: {
        userId: exam.userId,
        type: 'EMAIL',
        title: { contains: exam.title },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    if (!existingExamNotif) {
      const daysLeft = Math.max(1, Math.round((exam.examDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      await dispatchEmailNotification(exam.userId, {
        title: `📝 Upcoming Exam in ~${daysLeft} day(s): ${exam.title}`,
        message: `Your exam for ${exam.subject?.name || 'Subject'} (${exam.title}) is scheduled on ${exam.examDate.toLocaleString('en-IN')}. Venue: ${exam.venue || 'TBA'}.`,
        category: 'EXAM',
        priority: 'HIGH',
        dueDate: exam.examDate,
        actionUrl: `${env.FRONTEND_URL}/exams`,
        actionText: 'View Exam Tracker',
        details: [
          { label: 'Exam', value: exam.title },
          { label: 'Subject', value: exam.subject?.name || 'Enrolled Course' },
          { label: 'Date & Time', value: exam.examDate.toLocaleString('en-IN') },
          { label: 'Venue', value: exam.venue || 'Campus Examination Hall' },
        ],
      });
    }
  }
}

/**
 * 12-Hour Automated SMS Reminder:
 * Sends an SMS every 12 hours for all active/pending ERP assignments
 */
export async function checkAndSend12HourSmsReminders(): Promise<void> {
  const now = new Date();
  try {
    const openAssignments = await prisma.eRPAssignment.findMany({
      where: {
        status: 'AVAILABLE',
        closingDate: { gt: now },
        erpConnection: { isActive: true },
      },
      include: {
        erpConnection: { select: { userId: true } },
      },
    });

    for (const assignment of openAssignments) {
      const userId = assignment.erpConnection.userId;
      const recipientPhone = await getUserRecipientPhone(userId);
      if (!recipientPhone) continue;

      // Check if an SMS 12h reminder was queued within the last 11 hours
      const recentReminder = await prisma.assignmentHistory.findFirst({
        where: {
          assignmentId: assignment.id,
          changeType: 'SMS_12H_REMINDER',
          detectedAt: { gte: new Date(now.getTime() - 11 * 60 * 60 * 1000) },
        },
      });

      if (recentReminder) continue;

      const deadlineStr = assignment.closingDate
        ? assignment.closingDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Soon';

      const smsMessage = `LifePilot 12h Reminder: "${assignment.title}" (${assignment.subject || 'Assignment'}) is pending! Due: ${deadlineStr}. Submit on time!`;

      await dispatchSmsNotification(userId, recipientPhone, smsMessage);

      await prisma.assignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          changeType: 'SMS_12H_REMINDER',
          changedFields: { recipientPhone, reminderType: '12_HOUR_PERIODIC' },
        },
      });

      logger.info(`[SMS Scheduler] Queued 12h reminder to ${recipientPhone} for assignment ${assignment.title}`);
    }
  } catch (err: any) {
    logger.error(`[SMS Scheduler] Error in checkAndSend12HourSmsReminders: ${err.message}`);
  }
}

/**
 * 24-Hour Urgent Deadline SMS Alert:
 * Sends an urgent SMS when an open assignment deadline is less than 24 hours away
 */
export async function checkAndSend24HourDeadlineSmsReminders(): Promise<void> {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const urgentAssignments = await prisma.eRPAssignment.findMany({
      where: {
        status: 'AVAILABLE',
        closingDate: { gt: now, lte: next24h },
        erpConnection: { isActive: true },
      },
      include: {
        erpConnection: { select: { userId: true } },
      },
    });

    for (const assignment of urgentAssignments) {
      const userId = assignment.erpConnection.userId;
      const recipientPhone = await getUserRecipientPhone(userId);
      if (!recipientPhone) continue;

      // Check if 24h deadline reminder was already sent for this assignment
      const alreadySent = await prisma.assignmentHistory.findFirst({
        where: {
          assignmentId: assignment.id,
          changeType: 'SMS_24H_DEADLINE_REMINDER',
        },
      });

      if (alreadySent) continue;

      const deadlineStr = assignment.closingDate
        ? assignment.closingDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'within 24 hours';

      const smsMessage = `URGENT LifePilot Alert: "${assignment.title}" (${assignment.subject || 'Assignment'}) is due in less than 24 hours (${deadlineStr})! Submit immediately to avoid penalty.`;

      await dispatchSmsNotification(userId, recipientPhone, smsMessage);

      await prisma.assignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          changeType: 'SMS_24H_DEADLINE_REMINDER',
          changedFields: { recipientPhone, deadline: assignment.closingDate },
        },
      });

      logger.info(`[SMS Scheduler] Queued 24h URGENT deadline SMS to ${recipientPhone} for ${assignment.title}`);
    }
  } catch (err: any) {
    logger.error(`[SMS Scheduler] Error in checkAndSend24HourDeadlineSmsReminders: ${err.message}`);
  }
}

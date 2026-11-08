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
    where: { userId },
    select: { phoneNumber: true },
  });
  if (device?.phoneNumber) return device.phoneNumber;

  // Fallback to most recent recipientPhone used in SMS jobs for this user
  const lastJob = await prisma.smsJob.findFirst({
    where: { userId, recipientPhone: { not: '' } },
    orderBy: { createdAt: 'desc' },
    select: { recipientPhone: true },
  });
  if (lastJob?.recipientPhone) return lastJob.recipientPhone;

  return null;
}

function formatDeadlineDisplay(date?: Date | null): string {
  if (!date) return 'No deadline set';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Determines whether an assignment is strictly ONGOING or MISSED.
 * Explicitly filters out SUBMITTED, EVALUATED, RESULT, INELIGIBLE, and UPCOMING.
 */
export function isAssignmentOngoingOrMissed(
  status: string,
  closingDate?: Date | null,
  rawData?: any,
): { isEligible: boolean; alertType: 'ONGOING' | 'MISSED' } {
  const now = new Date();
  const raw = rawData || {};
  const computedStatus = (raw.computedStatus || raw.status || '').toUpperCase();

  // Strictly filter out submitted, evaluated, result, ineligible, and upcoming
  if (
    computedStatus.includes('SUBMITTED') ||
    computedStatus.includes('EVALUATED') ||
    computedStatus.includes('RESULT') ||
    computedStatus.includes('INELIGIBLE') ||
    computedStatus.includes('UPCOMING')
  ) {
    return { isEligible: false, alertType: 'ONGOING' };
  }

  const hasDeadlinePassed = closingDate ? now > new Date(closingDate) : false;

  // Missed: marked as missed, or closingDate has passed without submission/evaluation
  if (
    computedStatus.includes('MISSED') ||
    (status === 'CLOSED' && hasDeadlinePassed) ||
    (status === 'AVAILABLE' && hasDeadlinePassed)
  ) {
    return { isEligible: true, alertType: 'MISSED' };
  }

  // Ongoing: available or active or published and deadline has not passed
  if (
    !hasDeadlinePassed &&
    (status === 'AVAILABLE' ||
      computedStatus === 'ACTIVE' ||
      computedStatus === 'ONGOING' ||
      computedStatus === 'PUBLISHED')
  ) {
    return { isEligible: true, alertType: 'ONGOING' };
  }

  return { isEligible: false, alertType: 'ONGOING' };
}

/**
 * Dispatches automated email and SMS notifications strictly for ONGOING and MISSED assignments.
 * Format requirement: "subject name , which assignment , deadline"
 */
export async function sendOngoingOrMissedAssignmentAlert(
  userId: string,
  assignment: {
    id: string;
    title: string;
    subject?: string | null;
    closingDate?: Date | null;
    taskId?: string | null;
  },
  alertType: 'ONGOING' | 'MISSED'
): Promise<void> {
  const subjectName = assignment.subject || 'Enrolled Subject';
  const assignmentTitle = assignment.title || 'Assignment';
  const deadlineStr = formatDeadlineDisplay(assignment.closingDate);
  const isOngoing = alertType === 'ONGOING';

  // 1. In-App Notification
  await prisma.notification.create({
    data: {
      userId,
      taskId: assignment.taskId || undefined,
      type: 'IN_APP',
      status: 'PENDING',
      title: isOngoing
        ? `📚 [ONGOING] ${subjectName} — ${assignmentTitle}`
        : `⚠️ [MISSED] ${subjectName} — ${assignmentTitle}`,
      body: `Subject: ${subjectName}\nAssignment: ${assignmentTitle}\nDeadline: ${deadlineStr}`,
      data: {
        type: isOngoing ? 'ONGOING_ASSIGNMENT' : 'MISSED_ASSIGNMENT',
        assignmentId: assignment.id,
        subject: subjectName,
        title: assignmentTitle,
        deadline: deadlineStr,
      },
      scheduledAt: new Date(),
    },
  }).catch((err) => logger.warn(`[Notification] In-app record creation warning: ${err.message}`));

  // 2. Web & FCM Push Notification
  await sendPushNotification(userId, {
    title: isOngoing
      ? `📚 Ongoing: ${subjectName} — ${assignmentTitle}`
      : `⚠️ Missed: ${subjectName} — ${assignmentTitle}`,
    body: `Subject: ${subjectName} | Assignment: ${assignmentTitle} | Deadline: ${deadlineStr}`,
    data: {
      type: isOngoing ? 'ONGOING_ASSIGNMENT' : 'MISSED_ASSIGNMENT',
      assignmentId: assignment.id,
    },
  }).catch((err) => logger.warn(`[Notification] Push notification warning: ${err.message}`));

  // 3. Automated Gmail Notification (Subject Name, Which Assignment, Deadline)
  const emailTitle = isOngoing
    ? `📌 [ONGOING] ${subjectName} - ${assignmentTitle} | Due: ${deadlineStr}`
    : `⚠️ [MISSED] ${subjectName} - ${assignmentTitle} | Due: ${deadlineStr}`;

  const emailMessage = isOngoing
    ? `An ongoing assignment requires your action:\n\n• Subject Name: ${subjectName}\n• Which Assignment: ${assignmentTitle}\n• Deadline: ${deadlineStr}\n\nPlease complete and submit on your portal before the deadline.`
    : `A missed assignment was detected on your portal:\n\n• Subject Name: ${subjectName}\n• Which Assignment: ${assignmentTitle}\n• Deadline: ${deadlineStr} (Passed)\n\nPlease review your portal immediately.`;

  await dispatchEmailNotification(userId, {
    taskId: assignment.taskId || undefined,
    title: emailTitle,
    message: emailMessage,
    category: 'COLLEGE_ASSIGNMENT',
    priority: isOngoing ? 'HIGH' : 'CRITICAL',
    dueDate: assignment.closingDate ?? undefined,
    actionUrl: `${env.FRONTEND_URL}/tasks`,
    actionText: isOngoing ? 'Open Assignment in LifePilot' : 'Review Missed Assignment',
    badgeText: isOngoing ? 'ONGOING' : 'MISSED',
    details: [
      { label: 'Subject Name', value: subjectName },
      { label: 'Which Assignment', value: assignmentTitle },
      { label: 'Deadline', value: deadlineStr },
      { label: 'Status', value: isOngoing ? 'Ongoing (Pending Submission)' : 'Missed (Overdue)' },
    ],
  }).catch((err) => logger.warn(`[Notification] Email dispatch warning: ${err.message}`));

  // 4. Automated SMS via SIM Gateway (Subject Name, Which Assignment, Deadline)
  try {
    const recipientPhone = await getUserRecipientPhone(userId);
    if (recipientPhone) {
      const smsBody = isOngoing
        ? `LifePilot Alert [ONGOING]: Subject: ${subjectName} | Assignment: ${assignmentTitle} | Deadline: ${deadlineStr}. Submit before deadline!`
        : `LifePilot Alert [MISSED]: Subject: ${subjectName} | Assignment: ${assignmentTitle} | Deadline: ${deadlineStr} (Passed). Status: Missed!`;

      await dispatchSmsNotification(userId, recipientPhone, smsBody);
      logger.info(`[Notification] Automated SMS dispatched to ${recipientPhone} for ${alertType}: ${subjectName} - ${assignmentTitle}`);
    } else {
      logger.info(`[Notification] No phone number available for user ${userId}, skipped SMS.`);
    }
  } catch (smsErr: any) {
    logger.warn(`[Notification] Failed to dispatch automated SMS: ${smsErr.message}`);
  }
}

/**
 * Automatically evaluates all ERP assignments for a user and dispatches
 * email and SMS notifications strictly for ONGOING and MISSED assignments.
 */
export async function checkAndDispatchOngoingAndMissedAlerts(
  userId: string
): Promise<{ ongoingSent: number; missedSent: number }> {
  let ongoingSent = 0;
  let missedSent = 0;
  const now = new Date();

  const connections = await prisma.eRPConnection.findMany({
    where: { userId, isActive: true },
    select: { id: true },
  });

  if (connections.length === 0) return { ongoingSent, missedSent };
  const connectionIds = connections.map((c) => c.id);

  const assignments = await prisma.eRPAssignment.findMany({
    where: { erpConnectionId: { in: connectionIds } },
  });

  for (const a of assignments) {
    const { isEligible, alertType } = isAssignmentOngoingOrMissed(a.status, a.closingDate, a.rawData);
    if (!isEligible) continue;

    const historyType = alertType === 'MISSED' ? 'ALERT_MISSED_AUTO' : 'ALERT_ONGOING_AUTO';
    const cooldownHours = alertType === 'MISSED' ? 24 : 12;
    const cooldownThreshold = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000);

    const recentAlert = await prisma.assignmentHistory.findFirst({
      where: {
        assignmentId: a.id,
        changeType: historyType,
        detectedAt: { gte: cooldownThreshold },
      },
    });

    if (recentAlert) continue;

    await sendOngoingOrMissedAssignmentAlert(userId, a, alertType);

    await prisma.assignmentHistory.create({
      data: {
        assignmentId: a.id,
        changeType: historyType,
        changedFields: {
          alertType,
          subject: a.subject,
          title: a.title,
          deadline: a.closingDate,
          dispatchedAt: now.toISOString(),
        },
      },
    }).catch(() => {});

    if (alertType === 'ONGOING') ongoingSent++;
    else missedSent++;
  }

  logger.info(`[Notification] Automated alerts completed for user ${userId}: ${ongoingSent} ongoing, ${missedSent} missed.`);
  return { ongoingSent, missedSent };
}

/**
 * Global sweep across all active users with ERP connections.
 */
export async function checkAndDispatchAllOngoingAndMissedAlerts(): Promise<void> {
  try {
    const activeConnections = await prisma.eRPConnection.findMany({
      where: { isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const conn of activeConnections) {
      await checkAndDispatchOngoingAndMissedAlerts(conn.userId).catch((err) =>
        logger.error(`[Notification] Error in automated alerts for user ${conn.userId}:`, err)
      );
    }
  } catch (err: any) {
    logger.error(`[Notification] Error in checkAndDispatchAllOngoingAndMissedAlerts: ${err.message}`);
  }
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
  subject?: string | null,
  status?: string | null,
  rawData?: any,
  taskId?: string | null,
): Promise<void> {
  const { isEligible, alertType } = isAssignmentOngoingOrMissed(status || 'AVAILABLE', deadline, rawData);
  if (!isEligible) {
    // Strictly do not send emails or SMS for submitted/evaluated/upcoming assignments
    return;
  }

  await sendOngoingOrMissedAssignmentAlert(
    userId,
    { id: assignmentId, title, subject, closingDate: deadline, taskId },
    alertType
  );
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
 * Sends an SMS every 12 hours strictly for ONGOING ERP assignments.
 * Format requirement: "subject name , which assignment , deadline"
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
      const { isEligible, alertType } = isAssignmentOngoingOrMissed(
        assignment.status,
        assignment.closingDate,
        assignment.rawData
      );
      if (!isEligible || alertType !== 'ONGOING') continue;

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

      const subjectName = assignment.subject || 'Enrolled Subject';
      const assignmentTitle = assignment.title || 'Assignment';
      const deadlineStr = formatDeadlineDisplay(assignment.closingDate);

      const smsMessage = `LifePilot Alert [ONGOING]: Subject: ${subjectName} | Assignment: ${assignmentTitle} | Deadline: ${deadlineStr}. Submit before deadline!`;

      await dispatchSmsNotification(userId, recipientPhone, smsMessage);

      await prisma.assignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          changeType: 'SMS_12H_REMINDER',
          changedFields: { recipientPhone, subjectName, assignmentTitle, deadlineStr, reminderType: '12_HOUR_PERIODIC' },
        },
      });

      logger.info(`[SMS Scheduler] Queued 12h reminder to ${recipientPhone} for ${subjectName} - ${assignmentTitle}`);
    }
  } catch (err: any) {
    logger.error(`[SMS Scheduler] Error in checkAndSend12HourSmsReminders: ${err.message}`);
  }
}

/**
 * 24-Hour Urgent Deadline SMS Alert:
 * Sends an urgent SMS when an open ongoing assignment deadline is less than 24 hours away.
 * Format requirement: "subject name , which assignment , deadline"
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
      const { isEligible, alertType } = isAssignmentOngoingOrMissed(
        assignment.status,
        assignment.closingDate,
        assignment.rawData
      );
      if (!isEligible || alertType !== 'ONGOING') continue;

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

      const subjectName = assignment.subject || 'Enrolled Subject';
      const assignmentTitle = assignment.title || 'Assignment';
      const deadlineStr = formatDeadlineDisplay(assignment.closingDate);

      const smsMessage = `URGENT LifePilot Alert [ONGOING]: Subject: ${subjectName} | Assignment: ${assignmentTitle} | Deadline: ${deadlineStr}. Due in <24h! Submit immediately.`;

      await dispatchSmsNotification(userId, recipientPhone, smsMessage);

      await prisma.assignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          changeType: 'SMS_24H_DEADLINE_REMINDER',
          changedFields: { recipientPhone, subjectName, assignmentTitle, deadline: assignment.closingDate },
        },
      });

      logger.info(`[SMS Scheduler] Queued 24h URGENT deadline SMS to ${recipientPhone} for ${subjectName} - ${assignmentTitle}`);
    }
  } catch (err: any) {
    logger.error(`[SMS Scheduler] Error in checkAndSend24HourDeadlineSmsReminders: ${err.message}`);
  }
}

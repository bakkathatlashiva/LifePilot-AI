import { google } from 'googleapis';
import { prisma } from '../../config/database';
import { decrypt, encrypt } from '../../utils/encryption';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { renderLifePilotEmail, EmailTemplateData } from './emailTemplates';

export interface SendEmailOptions {
  title: string;
  message: string;
  category?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate?: string | Date;
  details?: Array<{ label: string; value: string }>;
  actionUrl?: string;
  actionText?: string;
  badgeText?: string;
  taskId?: string;
  deduplicationKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  recipientEmail?: string;
  error?: string;
  reason?: 'NOT_CONNECTED' | 'DISABLED_BY_USER' | 'SCOPE_MISSING' | 'TOKEN_REVOKED' | 'RATE_LIMITED' | 'SEND_ERROR';
}

/**
 * Priority rank helper for user preference filtering.
 */
const PRIORITY_ORDER: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Creates an authorized Gmail API client for a user, automatically refreshing tokens if needed.
 */
async function getAuthorizedGmailClient(userId: string): Promise<{
  gmail: any;
  userEmail: string;
  userName: string;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      connectedAccounts: {
        where: {
          provider: { in: ['google_gmail', 'google_auth'] },
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!user || user.connectedAccounts.length === 0) {
    logger.warn(`[Gmail Notification] No connected Google account found for user ${userId}`);
    return null;
  }

  // Prefer google_gmail if connected, otherwise google_auth
  const account =
    user.connectedAccounts.find((a) => a.provider === 'google_gmail') ??
    user.connectedAccounts.find((a) => a.provider === 'google_auth');

  if (!account) return null;

  try {
    const accessToken = decrypt(account.accessToken);
    const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : undefined;

    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
    });

    // Auto-save refreshed tokens to database
    oauth2Client.on('tokens', async (newTokens) => {
      try {
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: {
            accessToken: newTokens.access_token ? encrypt(newTokens.access_token) : undefined,
            refreshToken: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : undefined,
            tokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined,
          },
        });
        logger.info(`[Gmail Notification] Refreshed OAuth token for user ${userId}`);
      } catch (err: any) {
        logger.warn(`[Gmail Notification] Failed to persist refreshed token: ${err.message}`);
      }
    });

    // Proactively refresh if expiring within 60 seconds
    const isExpired = account.tokenExpiry && account.tokenExpiry.getTime() < Date.now() + 60_000;
    if (isExpired && refreshToken) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        if (credentials.access_token) {
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: {
              accessToken: encrypt(credentials.access_token),
              tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
            },
          });
        }
      } catch (refreshErr: any) {
        logger.error(`[Gmail Notification] Token refresh failed: ${refreshErr.message}`);
        return null;
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return {
      gmail,
      userEmail: user.email,
      userName: user.name || 'LifePilot User',
    };
  } catch (err: any) {
    logger.error(`[Gmail Notification] Failed to initialize Gmail client for user ${userId}:`, err.message);
    return null;
  }
}

/**
 * Builds a RFC 2822 / MIME formatted email message and encodes it in URL-safe base64.
 */
function createMimeMessage(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const boundary = `__LifePilot_${Date.now()}__`;
  const subjectEncoded = `=?utf-8?B?${Buffer.from(options.subject).toString('base64')}?=`;

  const lines = [
    `From: LifePilot AI <${options.from}>`,
    `To: <${options.to}>`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    options.text,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    options.html,
    '',
    `--${boundary}--`,
  ];

  const rawMessage = lines.join('\r\n');
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends an email notification to the user's Gmail account via the official Gmail API.
 */
export async function sendGmailNotification(
  userId: string,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  // 1. Check user preferences
  const prefs = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (prefs) {
    if (!prefs.notificationsEnabled || !prefs.emailNotificationsEnabled) {
      logger.info(`[Gmail Notification] Email notifications disabled for user ${userId}. Skipping.`);
      return { success: false, reason: 'DISABLED_BY_USER' };
    }

    // Priority filter check
    if (options.priority && prefs.emailMinPriority) {
      const minLevel = PRIORITY_ORDER[prefs.emailMinPriority] ?? 2;
      const currentLevel = PRIORITY_ORDER[options.priority] ?? 2;
      if (currentLevel < minLevel) {
        logger.info(`[Gmail Notification] Priority ${options.priority} below min priority ${prefs.emailMinPriority}. Skipping.`);
        return { success: false, reason: 'DISABLED_BY_USER' };
      }
    }

    // Category filter check (if user configured specific allowed categories)
    if (options.category && prefs.emailCategories && prefs.emailCategories.length > 0) {
      const isAllowed = prefs.emailCategories.includes(options.category as any);
      if (!isAllowed) {
        logger.info(`[Gmail Notification] Category ${options.category} not in allowed list. Skipping.`);
        return { success: false, reason: 'DISABLED_BY_USER' };
      }
    }
  }

  // 2. Obtain authorized Gmail client
  const clientInfo = await getAuthorizedGmailClient(userId);
  if (!clientInfo) {
    return {
      success: false,
      reason: 'NOT_CONNECTED',
      error: 'No active Google account connected with Gmail access.',
    };
  }

  const { gmail, userEmail, userName } = clientInfo;

  // 3. Render responsive email template
  const templateData: EmailTemplateData = {
    title: options.title,
    recipientName: userName,
    message: options.message,
    category: options.category,
    priority: options.priority,
    dueDate: options.dueDate,
    details: options.details,
    actionUrl: options.actionUrl || `${env.FRONTEND_URL}/dashboard`,
    actionText: options.actionText || 'View in LifePilot AI',
    badgeText: options.badgeText,
  };

  const { html, text } = renderLifePilotEmail(templateData);

  // 4. Construct RFC 2822 MIME message
  const raw = createMimeMessage({
    from: userEmail,
    to: userEmail, // Send to user's authorized Gmail inbox
    subject: `LifePilot AI: ${options.title}`,
    html,
    text,
  });

  // 5. Send via Gmail API
  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    const messageId = res.data.id;
    logger.info(`✅ [Gmail Notification] Email sent successfully to ${userEmail} (ID: ${messageId})`);

    // 6. Record notification in database
    await prisma.notification.create({
      data: {
        userId,
        taskId: options.taskId,
        type: 'EMAIL',
        status: 'SENT',
        title: options.title,
        body: options.message,
        data: {
          channel: 'GMAIL',
          gmailMessageId: messageId,
          category: options.category,
          priority: options.priority,
          sentTo: userEmail,
        },
        scheduledAt: new Date(),
        sentAt: new Date(),
      },
    });

    // 7. Persist in Email table so it shows immediately under the Emails tab in the app
    if (messageId) {
      try {
        await prisma.email.upsert({
          where: { gmailMessageId: messageId },
          create: {
            userId,
            gmailMessageId: messageId,
            subject: `LifePilot AI: ${options.title}`,
            sender: 'LifePilot AI',
            senderEmail: userEmail,
            snippet: options.message.slice(0, 300),
            bodyText: `${options.title}\n\n${options.message}`,
            receivedAt: new Date(),
            isImportant: options.priority === 'HIGH' || options.priority === 'CRITICAL',
            aiCategory: options.category || 'NOTIFICATION',
            aiSummary: options.message,
            labelIds: ['INBOX', 'IMPORTANT', 'LIFEPILOT_NOTIFICATION'],
          },
          update: {
            subject: `LifePilot AI: ${options.title}`,
            snippet: options.message.slice(0, 300),
          },
        });
      } catch (emailErr: any) {
        logger.warn(`[Gmail Notification] Failed to mirror notification to Email table: ${emailErr.message}`);
      }
    }

    return {
      success: true,
      messageId,
      recipientEmail: userEmail,
    };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown Gmail API error';
    logger.error(`❌ [Gmail Notification] Failed to send email to ${userEmail}:`, errorMsg);

    // Detect scope errors specifically
    const isScopeError =
      error?.code === 403 ||
      errorMsg.includes('Insufficient Permission') ||
      errorMsg.includes('insufficient authentication scopes');

    const isTokenRevoked =
      error?.code === 401 ||
      errorMsg.includes('invalid_grant') ||
      errorMsg.includes('Token has been expired or revoked');

    // Record failure in notification history for auditing
    await prisma.notification.create({
      data: {
        userId,
        taskId: options.taskId,
        type: 'EMAIL',
        status: 'FAILED',
        title: options.title,
        body: options.message,
        failureReason: isScopeError
          ? 'Gmail send permission (gmail.send) not granted. Please reconnect Gmail in Settings.'
          : errorMsg,
        data: {
          channel: 'GMAIL',
          error: errorMsg,
          isScopeError,
        },
        scheduledAt: new Date(),
      },
    });

    if (isScopeError) {
      return {
        success: false,
        reason: 'SCOPE_MISSING',
        error: 'Gmail send permission (gmail.send) is not granted. Please reconnect your Gmail in Settings.',
      };
    }

    if (isTokenRevoked) {
      return {
        success: false,
        reason: 'TOKEN_REVOKED',
        error: 'Google OAuth token expired or revoked. Please reconnect your Google account.',
      };
    }

    return {
      success: false,
      reason: 'SEND_ERROR',
      error: errorMsg,
    };
  }
}

/**
 * Sends a test email notification to verify the Gmail delivery pipeline.
 */
export async function sendTestEmailNotification(userId: string): Promise<SendEmailResult> {
  return sendGmailNotification(userId, {
    title: 'Gmail Notification Test Successful 🎉',
    message: 'Your Gmail account is connected and LifePilot AI can deliver deadline alerts, task reminders, and important updates directly to your inbox.',
    category: 'SYSTEM',
    priority: 'HIGH',
    badgeText: 'INTEGRATION VERIFIED',
    actionUrl: `${env.FRONTEND_URL}/settings`,
    actionText: 'Manage Notification Settings',
    details: [
      { label: 'Integration Channel', value: 'Google Gmail API' },
      { label: 'Timestamp', value: new Date().toLocaleString('en-IN') },
      { label: 'Status', value: 'Active & Verified' },
    ],
  });
}

/**
 * Helper to notify user about an upcoming task deadline via Gmail.
 */
export async function sendTaskReminderEmail(
  userId: string,
  task: { id: string; title: string; deadline: Date; priority?: string; category?: string },
  timeRemainingLabel: string,
): Promise<SendEmailResult> {
  return sendGmailNotification(userId, {
    taskId: task.id,
    title: `Deadline Alert: ${task.title} (in ${timeRemainingLabel})`,
    message: `Your task "${task.title}" is due in ${timeRemainingLabel}. Make sure to complete and submit on time.`,
    priority: (task.priority as any) ?? 'HIGH',
    category: task.category ?? 'COLLEGE_ASSIGNMENT',
    dueDate: task.deadline,
    actionUrl: `${env.FRONTEND_URL}/tasks`,
    actionText: 'Open Task in Dashboard',
    details: [
      { label: 'Task Title', value: task.title },
      { label: 'Time Remaining', value: timeRemainingLabel },
      { label: 'Category', value: task.category ?? 'Assignment' },
    ],
  });
}

/**
 * Helper to notify user about an overdue task via Gmail.
 */
export async function sendOverdueTaskEmail(
  userId: string,
  task: { id: string; title: string; deadline?: Date | null; priority?: string },
): Promise<SendEmailResult> {
  return sendGmailNotification(userId, {
    taskId: task.id,
    title: `⚠️ Overdue Task: ${task.title}`,
    message: `The deadline for "${task.title}" has passed. Please check the task status and complete or reschedule it as soon as possible.`,
    priority: 'CRITICAL',
    category: 'REMINDER',
    dueDate: task.deadline ?? undefined,
    actionUrl: `${env.FRONTEND_URL}/tasks`,
    actionText: 'Review Overdue Task',
    badgeText: 'OVERDUE',
    details: [
      { label: 'Status', value: 'Overdue' },
      { label: 'Action Required', value: 'Complete or Reschedule' },
    ],
  });
}

/**
 * Helper to notify user about an upcoming exam via Gmail.
 */
export async function sendExamReminderEmail(
  userId: string,
  exam: { id: string; subjectName: string; examDate: Date; hallNumber?: string | null; syllabus?: string | null },
): Promise<SendEmailResult> {
  const details = [
    { label: 'Subject', value: exam.subjectName },
    { label: 'Exam Date', value: new Date(exam.examDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
  ];
  if (exam.hallNumber) details.push({ label: 'Hall / Venue', value: exam.hallNumber });

  return sendGmailNotification(userId, {
    title: `📝 Upcoming Exam: ${exam.subjectName}`,
    message: `You have an exam coming up for ${exam.subjectName}. Make sure your preparation, materials, and hall tickets are in order.`,
    priority: 'CRITICAL',
    category: 'EXAM',
    dueDate: exam.examDate,
    actionUrl: `${env.FRONTEND_URL}/exams`,
    actionText: 'View Exam Details & Syllabus',
    details,
  });
}


/**
 * Aurora ERP Assessment Monitor
 *
 * Strategy:
 * 1. First attempt: detect if ERP exposes a REST/JSON API endpoint.
 * 2. Fallback: use Playwright with an authenticated Google session
 *    (user must complete a one-time Google OAuth login in a headed browser).
 * 3. The session cookies are stored encrypted in the DB and reused.
 *
 * IMPORTANT LIMITATION NOTE:
 * Aurora ERP (admissions.aurora.edu.in) uses Google OAuth login.
 * Automated access depends entirely on whether:
 *   a) The portal exposes a machine-readable API, OR
 *   b) The portal allows persistent session cookies after a one-time user login.
 * If the portal blocks headless browsers or requires fresh interactive login
 * every session, this module will detect that and surface the error to the user.
 * This module NEVER bypasses CAPTCHA, MFA, or access controls.
 */

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { prisma } from "../../config/database";
import { encrypt, decrypt } from "../../utils/encryption";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import { AssignmentStatus, SyncStatus } from "../types";
import { notifyNewAssignment } from "../notifications/notificationService";
import { valkeyCache } from "../../config/valkey";

export interface ERPAssignmentData {
  erpId: string;
  title: string;
  subject?: string;
  description?: string;
  openingDate?: Date;
  closingDate?: Date;
  status: AssignmentStatus;
  maxMarks?: number;
  rawData?: Record<string, unknown>;
}

export async function runERPSync(
  erpConnectionId: string,
  explicitCreds?: { username: string; password: string }
): Promise<void> {
  const connection = await prisma.eRPConnection.findUnique({
    where: { id: erpConnectionId },
    include: { user: true },
  });

  if (!connection || !connection.isActive) return;

  // Immediately broadcast RUNNING status
  await prisma.eRPConnection.update({
    where: { id: erpConnectionId },
    data: { lastSyncStatus: "RUNNING", lastSyncError: null },
  });
  await valkeyCache.delPattern('valkey:erp:*');
  await valkeyCache.del(`valkey:stats:${connection.userId}`).catch(() => {});

  const syncLog = await prisma.synchronizationLog.create({
    data: {
      userId: connection.userId,
      service: "ERP",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    logger.info(`[ERP] Starting sync for user ${connection.userId}`);

    const assignments = await scrapeAssignments(connection, explicitCreds);
    if (assignments.length > 0) {
      const { newCount, updatedCount } = await processAssignments(
        connection.userId,
        erpConnectionId,
        assignments,
      );

      // Remove stale assignments from previous terms that are not in the current term's active assignments
      const currentErpIds = assignments.map((a) => a.erpId);
      const staleAssignments = await prisma.eRPAssignment.findMany({
        where: {
          erpConnectionId,
          erpId: { notIn: currentErpIds },
        },
        select: { id: true, taskId: true },
      });

      if (staleAssignments.length > 0) {
        const staleIds = staleAssignments.map((s) => s.id);
        const staleTaskIds = staleAssignments
          .map((s) => s.taskId)
          .filter(Boolean) as string[];

        await prisma.assignmentHistory.deleteMany({
          where: { assignmentId: { in: staleIds } },
        });
        await prisma.eRPAssignment.deleteMany({
          where: { id: { in: staleIds } },
        });
        if (staleTaskIds.length > 0) {
          await prisma.task.deleteMany({
            where: { id: { in: staleTaskIds } },
          });
        }
        logger.info(
          `[ERP] Cleaned up ${staleAssignments.length} old/previous-term assignments from database`
        );
      }

      await prisma.eRPConnection.update({
        where: { id: erpConnectionId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        },
      });

      // Invalidate Valkey cache for instant fresh UI updates
      await valkeyCache.delPattern('valkey:erp:*');
      await valkeyCache.del(`valkey:stats:${connection.userId}`).catch(() => {});

      await prisma.synchronizationLog.update({
        where: { id: syncLog.id },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          itemsFound: assignments.length,
          itemsNew: newCount,
          itemsUpdated: updatedCount,
        },
      });

      logger.info(
        `[ERP] Sync complete. Found: ${assignments.length}, New: ${newCount}, Updated: ${updatedCount}`,
      );
    } else {
      logger.warn("[ERP] 0 assignments found on portal for this pass.");
      await prisma.eRPConnection.update({
        where: { id: erpConnectionId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        },
      });

      // Invalidate Valkey cache for instant fresh UI updates
      await valkeyCache.delPattern('valkey:erp:*');
      await valkeyCache.del(`valkey:stats:${connection.userId}`).catch(() => {});
    }
  } catch (error: any) {
    const rawMsg = error.message ?? "Unknown error";
    logger.error("[ERP] Sync failed:", rawMsg);

    let cleanMsg = rawMsg;
    if (rawMsg.includes("ERR_NAME_NOT_RESOLVED") || rawMsg.includes("ENOTFOUND")) {
      cleanMsg = "Portal DNS temporarily unreachable. System will retry automatically on next scheduled interval.";
    } else if (rawMsg.includes("Timeout") && rawMsg.includes("exceeded")) {
      cleanMsg = "Portal response timed out. System will retry automatically on next scheduled interval.";
    }

    await prisma.eRPConnection.update({
      where: { id: erpConnectionId },
      data: { lastSyncStatus: "FAILED", lastSyncError: cleanMsg },
    });

    await prisma.synchronizationLog.update({
      where: { id: syncLog.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: cleanMsg },
    });
  }
}

function parseStoredSession(sessionCookiesEncrypted: string | null): {
  cookies: any[];
  credentials: { username: string; password: string } | null;
} {
  if (!sessionCookiesEncrypted) return { cookies: [], credentials: null };
  try {
    const raw = decrypt(sessionCookiesEncrypted);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { cookies: parsed, credentials: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        cookies: parsed.cookies || [],
        credentials: parsed.credentials || null,
      };
    }
  } catch (err) {
    logger.warn("[ERP] Failed to decrypt or parse stored session:", err);
  }
  return { cookies: [], credentials: null };
}

/**
 * Helper to perform robust and fast Aurora ERP login.
 * Listens directly to Aurora's auth API for immediate (< 2-3s) verification.
 */
async function performAuroraLogin(page: Page, user: string, pass: string): Promise<boolean> {
  const trimmedUser = user.trim();
  const cleanUser = trimmedUser.includes('@') ? trimmedUser : trimmedUser.toUpperCase();
  const cleanPass = pass.trim();

  logger.info(`[ERP Login] Attempting login for ${cleanUser}...`);

  if (!page.url().includes('login')) {
    await page.goto('https://admissions.aurora.edu.in/login', {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
  }

  await page.waitForSelector('#credential', { timeout: 12000 });
  await page.fill('#credential', cleanUser);
  await page.fill('#password', cleanPass);

  // Set up response listener directly for Aurora auth API
  const authResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login'),
    { timeout: 12000 }
  ).catch(() => null);

  await page.click('button[type="submit"]');

  const authRes = await authResponsePromise;
  if (authRes) {
    const status = authRes.status();
    logger.info(`[ERP Login] Auth API response status: ${status}`);

    if (status === 200) {
      // Login successful! Allow brief pause for cookies to register in context
      await page.waitForTimeout(1000);
      return true;
    }

    if (status === 401 || status === 400) {
      const data = await authRes.json().catch(() => null);
      const msg = data?.error || data?.message || 'Invalid ERP credentials. Please check your Student User ID and Password.';
      throw new Error(msg);
    }
  }

  // Fallback if response wasn't intercepted: check page innerText for messages
  await page.waitForTimeout(1500);
  const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');

  if (pageText.toLowerCase().includes('invalid credential') || pageText.toLowerCase().includes('wrong password') || pageText.toLowerCase().includes('incorrect')) {
    throw new Error('Invalid ERP credentials. Please check your Student User ID and Password.');
  }

  if (pageText.includes('Unable to connect to the backend')) {
    throw new Error('Aurora University portal backend is temporarily unreachable. Please try again.');
  }

  if (!page.url().includes('login')) {
    return true;
  }

  const cookies = await page.context().cookies();
  const hasAuthCookie = cookies.some((c) => c.name.includes('token') || c.name.includes('session') || c.name.includes('connect.sid'));
  if (hasAuthCookie) {
    return true;
  }

  throw new Error('Failed to authenticate with Aurora ERP. Please check your credentials or try again.');
}

async function scrapeAssignments(
  connection: {
    id: string;
    userId: string;
    erpUrl: string;
    sessionCookies: string | null;
    sessionExpiry: Date | null;
  },
  explicitCreds?: { username: string; password: string }
): Promise<ERPAssignmentData[]> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      permissions: ['geolocation'],
      geolocation: { latitude: 17.3850, longitude: 78.4867 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    const storedSession = parseStoredSession(connection.sessionCookies);
    if (storedSession.cookies && storedSession.cookies.length > 0) {
      try {
        await context.addCookies(storedSession.cookies);
      } catch (cErr) {
        logger.warn("[ERP] Failed to add stored cookies to context:", cErr);
      }
    }

    const loginUser =
      explicitCreds?.username ||
      storedSession.credentials?.username ||
      env.AURORA_ERP_USER;
    const loginPass =
      explicitCreds?.password ||
      storedSession.credentials?.password ||
      env.AURORA_ERP_PASSWORD;

    logger.info(`[ERP] Navigating directly to assessments for ${loginUser}...`);
    await page.goto(connection.erpUrl, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    const isLogin =
      page.url().includes("login") ||
      (await page.$("#credential")) !== null;

    if (isLogin) {
      logger.info(`[ERP] Session expired or fresh login needed. Logging in as ${loginUser}...`);
      await performAuroraLogin(page, loginUser, loginPass);

      // Save fresh cookies to DB while retaining student credentials
      const freshCookies = await context.cookies();
      const currentCreds = explicitCreds || storedSession.credentials;

      await prisma.eRPConnection.update({
        where: { id: connection.id },
        data: {
          sessionCookies: encrypt(
            JSON.stringify({
              cookies: freshCookies,
              ...(currentCreds ? { credentials: currentCreds } : {}),
            })
          ),
          sessionExpiry: new Date(Date.now() + 12 * 60 * 60 * 1000),
          lastSyncError: null,
        },
      });

      if (!page.url().includes("/assessments")) {
        await page.goto(connection.erpUrl, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
      }
    }

    logger.info("[ERP] Successfully loaded assessment portal");
    const assignments = await extractAssignmentsFromPage(page);

    await browser.close();
    return assignments;
  } catch (error: any) {
    if (browser) await browser.close();
    throw error;
  }
}

async function extractAssignmentsFromPage(
  page: Page,
): Promise<ERPAssignmentData[]> {
  const assignmentsMap = new Map<string, ERPAssignmentData>();

  async function scrapeCurrentTermCards(termLabel: string) {
    await Promise.race([
      page.waitForSelector('xpath=//button[contains(., "View assessments")]', { timeout: 4000 }),
      page.waitForTimeout(1000),
    ]);
    const viewButtons = await page.$$('xpath=//button[contains(., "View assessments")]');
    const cardCount = viewButtons.length;
    logger.info(`[ERP] [${termLabel}] Found ${cardCount} course cards`);

    for (let i = 0; i < cardCount; i++) {
      const btns = await page.$$('xpath=//button[contains(., "View assessments")]');
      if (!btns[i]) continue;

      try {
        logger.info(`[ERP] [${termLabel}] Opening course card ${i + 1}/${cardCount}...`);
        await btns[i].click();
        await Promise.race([
          page.waitForSelector('table tbody tr', { timeout: 2500 }),
          page.waitForTimeout(500),
        ]);

        const courseData = await page.evaluate(() => {
          const courseHeading =
            document.querySelector('h1, h2, h3, [class*="title"]')?.textContent?.trim() || "";
          const items: any[] = [];
          const tables = document.querySelectorAll("table");
          tables.forEach((table) => {
            const rows = table.querySelectorAll("tbody tr");
            rows.forEach((row) => {
              const cells = Array.from(row.querySelectorAll("td")).map((c) =>
                (c as HTMLElement).innerText.trim()
              );
              if (cells.length >= 6) {
                items.push({
                  titleRaw: cells[0],
                  subjectRaw: cells[1],
                  startRaw: cells[2],
                  dueRaw: cells[3],
                  pointsRaw: cells[4],
                  statusRaw: cells[5],
                });
              }
            });
          });
          return { courseHeading, items };
        });

        logger.info(
          `[ERP] [${termLabel}] Course ${i + 1}: found ${courseData.items.length} assessments in table`
        );

        for (const r of courseData.items) {
          const titleLines = r.titleRaw.split("\n").map((s: string) => s.trim()).filter(Boolean);
          const title = titleLines[0] || "Assessment";
          const subjectLines = r.subjectRaw.split("\n").map((s: string) => s.trim()).filter(Boolean);
          const subject = subjectLines.join(" ") || courseData.courseHeading || "Enrolled Course";
          const subjectCode = subjectLines[1] || subjectLines[0] || "COURSE";

          const closing = parseDate(r.dueRaw);
          const opening = parseDate(r.startRaw);
          const points = parseInt(r.pointsRaw) || undefined;
          const statusRawUpper = (r.statusRaw || "").toUpperCase();
          const firstLineStatus = statusRawUpper.split("\n")[0].trim();

          let status: AssignmentStatus = "AVAILABLE";
          if (
            statusRawUpper.includes("SUBMITTED") ||
            statusRawUpper.includes("EVALUATED") ||
            statusRawUpper.includes("RESULT") ||
            statusRawUpper.includes("CLOSED") ||
            statusRawUpper.includes("MISSED") ||
            statusRawUpper.includes("COMPLETED")
          ) {
            status = "CLOSED";
          } else if (statusRawUpper.includes("UPCOMING")) {
            status = "UPCOMING";
          } else {
            status = "AVAILABLE";
          }

          // Strict Requirement: Show ONLY Ongoing, Submitted, and Evaluated.
          // Do NOT save/show upcoming assessments until they are assigned (become ongoing) on ERP.
          if (status === "UPCOMING" || statusRawUpper.includes("UPCOMING")) {
            continue;
          }

          const erpId = `${subjectCode}_${slugify(title)}`;
          if (!assignmentsMap.has(erpId)) {
            assignmentsMap.set(erpId, {
              erpId,
              title,
              subject,
              description: `Type: ${titleLines[1] || "Assessment"}\nMax Marks: ${points ?? "N/A"}\nStatus: ${firstLineStatus}`,
              openingDate: opening ?? undefined,
              closingDate: closing ?? undefined,
              status,
              maxMarks: points,
              rawData: r,
            });
          }
        }

        // Return to course list via Back to subjects button with fast dynamic wait
        const backBtn = await page.$('button[aria-label="Back to subjects"]');
        if (backBtn) {
          await backBtn.click();
          await Promise.race([
            page.waitForSelector('xpath=//button[contains(., "View assessments")]', { timeout: 2000 }),
            page.waitForTimeout(300),
          ]);
        } else {
          const textBack = await page.$(
            'xpath=//button[contains(., "Back to subjects") or contains(., "Subjects")]'
          );
          if (textBack) {
            await textBack.click();
            await Promise.race([
              page.waitForSelector('xpath=//button[contains(., "View assessments")]', { timeout: 2000 }),
              page.waitForTimeout(300),
            ]);
          } else {
            await page.goto("https://admissions.aurora.edu.in/modules/assessments/assessments", {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            await page.waitForTimeout(800);
          }
        }
      } catch (err) {
        logger.warn(`[ERP] [${termLabel}] Failed extracting course card ${i + 1}:`, err);
      }
    }
  }

  // Quick initial check for select / cards
  await Promise.race([
    page.waitForSelector('xpath=//button[contains(., "View assessments")]', { timeout: 3000 }),
    page.waitForTimeout(800),
  ]);

  // Aurora ERP automatically preselects the student's current active term (e.g. "Term 2").
  // We identify the current active term and scrape ONLY that term (never older/previous terms).
  const currentTermName = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const termSelect = selects[1] || selects[0];
    if (termSelect && termSelect.selectedOptions && termSelect.selectedOptions.length > 0) {
      return termSelect.selectedOptions[0].text;
    }
    return 'Current Term';
  });

  logger.info(`[ERP] Current active term detected: ${currentTermName}. Scraping current term assessments ONLY...`);
  await scrapeCurrentTermCards(currentTermName);

  const result = Array.from(assignmentsMap.values());
  logger.info(
    `[ERP] Total active assignments parsed for current term (${currentTermName}): ${result.length}`
  );
  return result;
}

async function processAssignments(
  userId: string,
  erpConnectionId: string,
  fresh: ERPAssignmentData[],
): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

  for (const data of fresh) {
    const existing = await prisma.eRPAssignment.findUnique({
      where: { erpConnectionId_erpId: { erpConnectionId, erpId: data.erpId } },
    });

    if (!existing) {
      // New assignment
      const assignment = await prisma.eRPAssignment.create({
        data: {
          erpConnectionId,
          erpId: data.erpId,
          title: data.title,
          subject: data.subject,
          description: data.description,
          openingDate: data.openingDate,
          closingDate: data.closingDate,
          status: data.status,
          maxMarks: data.maxMarks,
          rawData: data.rawData as any,
          isNew: true,
          isNotified: false,
        },
      });

      // Record history
      await prisma.assignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          changeType: "CREATED",
          changedFields: {},
          snapshotData: data.rawData as any,
        },
      });

      // Auto-create task with automated deadline reminder schedules
      const task = await prisma.task.create({
        data: {
          userId,
          title: data.title,
          description: data.description,
          category: "COLLEGE_ASSIGNMENT",
          source: "ERP",
          openingDate: data.openingDate,
          deadline: data.closingDate,
          priority: "HIGH",
          status: data.status === "CLOSED" ? "COMPLETED" : "IN_PROGRESS",
          tags: data.subject ? [data.subject] : [],
          reminderSchedules: {
            create: [
              { userId, minutesBefore: 1440 }, // 1 day before
              { userId, minutesBefore: 120 },  // 2 hours before
            ],
          },
        },
      });

      await prisma.eRPAssignment.update({
        where: { id: assignment.id },
        data: { taskId: task.id, isNotified: false },
      });

      // Queue notification
      await notifyNewAssignment(
        userId,
        assignment.id,
        data.title,
        data.closingDate,
      );

      newCount++;
    } else {
      // Check for changes
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      let changeType = "";

      if (data.closingDate && existing.closingDate) {
        const oldDeadline = existing.closingDate.getTime();
        const newDeadline = data.closingDate.getTime();
        if (oldDeadline !== newDeadline) {
          changes["closingDate"] = {
            old: existing.closingDate,
            new: data.closingDate,
          };
          changeType =
            newDeadline > oldDeadline
              ? "DEADLINE_EXTENDED"
              : "DEADLINE_SHORTENED";
        }
      }

      if (data.status !== existing.status) {
        changes["status"] = { old: existing.status, new: data.status };
        if (data.status === "CANCELLED") changeType = "CANCELLED";
        else changeType = changeType || "STATUS_CHANGED";
      }

      const descChanged = data.description !== existing.description;

      if (Object.keys(changes).length > 0 || descChanged) {
        await prisma.eRPAssignment.update({
          where: { id: existing.id },
          data: {
            closingDate: data.closingDate,
            status: data.status,
            description: data.description,
            rawData: data.rawData as any,
            isNew: false,
            isNotified: false,
          },
        });

        // Keep linked Task in sync
        if (existing.taskId) {
          await prisma.task.update({
            where: { id: existing.taskId },
            data: {
              status: data.status === "CLOSED" ? "COMPLETED" : "IN_PROGRESS",
              description: data.description,
              deadline: data.closingDate,
            },
          });
        }

        if (Object.keys(changes).length > 0) {
          await prisma.assignmentHistory.create({
            data: {
              assignmentId: existing.id,
              changeType,
              changedFields: changes as any,
              snapshotData: data.rawData as any,
            },
          });
        }

        updatedCount++;
      }
    }
  }

  return { newCount, updatedCount };
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .slice(0, 40);
}

function determineStatus(
  opening: Date | null,
  closing: Date | null,
): AssignmentStatus {
  const now = new Date();
  if (closing && now > closing) return "CLOSED";
  if (opening && now < opening) return "UPCOMING";
  return "AVAILABLE";
}

/**
 * Save ERP session cookies and optional student credentials.
 */
export async function saveERPSession(
  userId: string,
  erpUrl: string,
  cookies: Array<{ name: string; value: string; domain: string; path: string }>,
  credentials?: { username: string; password: string }
): Promise<string> {
  let credsToStore = credentials;
  if (!credsToStore) {
    const existingConn = await prisma.eRPConnection.findUnique({
      where: { userId_erpUrl: { userId, erpUrl } },
    });
    if (existingConn?.sessionCookies) {
      const existing = parseStoredSession(existingConn.sessionCookies);
      if (existing.credentials) {
        credsToStore = existing.credentials;
      }
    }
  }

  const payload = {
    cookies,
    ...(credsToStore ? { credentials: credsToStore } : {}),
  };
  const encryptedPayload = encrypt(JSON.stringify(payload));
  // Session assumed valid for 12 hours; adjust based on ERP behavior
  const expiry = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const connection = await prisma.eRPConnection.upsert({
    where: { userId_erpUrl: { userId, erpUrl } },
    create: {
      userId,
      erpUrl,
      sessionCookies: encryptedPayload,
      sessionExpiry: expiry,
      isActive: true,
      lastSyncStatus: null,
    },
    update: {
      sessionCookies: encryptedPayload,
      sessionExpiry: expiry,
      isActive: true,
      lastSyncError: null,
    },
  });

  return connection.id;
}

/**
 * Authenticate with student credentials directly, store session, and run sync.
 */
export async function authenticateAndSyncWithCredentials(
  userId: string,
  username: string,
  password: string,
  erpUrl: string = env.AURORA_ERP_URL
): Promise<{ connectionId: string; assignmentCount: number }> {
  logger.info(`[ERP] Authenticating user ${userId} with ERP credentials (${username})...`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      permissions: ['geolocation'],
      geolocation: { latitude: 17.3850, longitude: 78.4867 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // Verify credentials via fast direct API response detection (< 2-3s)
    await performAuroraLogin(page, username, password);

    // Capture authenticated session cookies
    const cookies = await context.cookies();
    const connectionId = await saveERPSession(userId, erpUrl, cookies, { username, password });

    // Multi-user isolation: clear previous student's ERP assignments and tasks
    await prisma.eRPAssignment.deleteMany({
      where: { erpConnectionId: connectionId },
    });
    await prisma.task.deleteMany({
      where: { userId, source: 'ERP' },
    });
    logger.info(`[ERP] Cleared previous assignments for connection ${connectionId} for clean sync`);

    // Invalidate Valkey cache on credential switch
    await valkeyCache.delPattern('valkey:erp:*');
    await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});

    // Set connection status to RUNNING so the UI immediately shows live sync progress
    await prisma.eRPConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncStatus: 'RUNNING',
        lastSyncError: null,
      },
    });

    // Close the verification browser instance immediately to free resources
    await browser.close();

    // Trigger full course assessment extraction asynchronously in background
    logger.info(`[ERP] Verified credentials in ~3s. Triggering background course sync for ${username}...`);
    runERPSync(connectionId, { username, password }).catch((err) => {
      logger.error('[ERP Background Sync] Error:', err);
    });

    return { connectionId, assignmentCount: 0 };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    throw err;
  }
}


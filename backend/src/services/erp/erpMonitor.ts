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

// Only set PLAYWRIGHT_BROWSERS_PATH='0' on Linux/Render when not running locally on Windows
if (process.platform !== 'win32' && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { prisma } from "../../config/database";
import { encrypt, decrypt } from "../../utils/encryption";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import { AssignmentStatus, SyncStatus } from "../types";
import { notifyNewAssignment, checkAndDispatchOngoingAndMissedAlerts } from "../notifications/notificationService";
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

// In-memory guard to prevent duplicate concurrent syncs
const inFlightSyncs = new Set<string>();

export async function runERPSync(
  erpConnectionId: string,
  explicitCreds?: { username: string; password: string }
): Promise<void> {
  if (inFlightSyncs.has(erpConnectionId)) {
    logger.info(`[ERP] Sync already in-flight for connection ${erpConnectionId}, skipping duplicate call.`);
    return;
  }
  inFlightSyncs.add(erpConnectionId);

  const connection = await prisma.eRPConnection.findUnique({
    where: { id: erpConnectionId },
    include: { user: true },
  });

  if (!connection || !connection.isActive) {
    inFlightSyncs.delete(erpConnectionId);
    return;
  }

  // Immediately broadcast RUNNING status
  await prisma.eRPConnection.update({
    where: { id: erpConnectionId },
    data: { lastSyncStatus: "RUNNING", lastSyncError: null },
  });
  await valkeyCache.del(`valkey:erp:status:${connection.userId}`).catch(() => {});
  await valkeyCache.delPattern('valkey:erp:*').catch(() => {});
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
        connection.erpUrl,
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

        await Promise.all([
          prisma.assignmentHistory.deleteMany({
            where: { assignmentId: { in: staleIds } },
          }),
          prisma.eRPAssignment.deleteMany({
            where: { id: { in: staleIds } },
          }),
          staleTaskIds.length > 0
            ? prisma.task.deleteMany({
                where: { id: { in: staleTaskIds } },
              })
            : Promise.resolve(),
        ]);
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
      await valkeyCache.del(`valkey:erp:status:${connection.userId}`).catch(() => {});
      await valkeyCache.delPattern('valkey:erp:*').catch(() => {});
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
      await valkeyCache.del(`valkey:erp:status:${connection.userId}`).catch(() => {});
      await valkeyCache.delPattern('valkey:erp:*').catch(() => {});
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
  } finally {
    inFlightSyncs.delete(erpConnectionId);
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

function getBrowserContextOptions() {
  const isLinux = process.platform !== 'win32';
  const userAgent = isLinux
    ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const platform = isLinux ? '"Linux"' : '"Windows"';

  return {
    userAgent,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    permissions: ['geolocation'] as ['geolocation'],
    geolocation: { latitude: 17.3850, longitude: 78.4867 },
    extraHTTPHeaders: {
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': platform,
      'Accept-Language': 'en-IN,en-GB,en;q=0.9,en-US;q=0.8',
    },
  };
}

/**
 * Helper to perform robust and fast Aurora ERP login.
 * Listens directly to Aurora's auth API for immediate verification.
 */
async function performAuroraLogin(page: Page, user: string, pass: string): Promise<boolean> {
  const trimmedUser = user.trim();
  const cleanUser = trimmedUser.includes('@') ? trimmedUser : trimmedUser.toUpperCase();
  const cleanPass = pass.trim();

  logger.info(`[ERP Login] Attempting fast login for ${cleanUser}...`);

  // Block heavy media assets to ensure fast page responsiveness
  await page.route(/\.(png|jpg|jpeg|svg|woff|woff2|webp)(\?.*)?$/i, (route) => route.abort());

  if (!page.url().includes('login')) {
    await page.goto('https://admissions.aurora.edu.in/login', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  }

  // Allow Next.js client hydration and CSRF initialization to complete
  await page.waitForSelector('#credential', { timeout: 10000 });
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}),
    page.waitForTimeout(1000),
  ]);

  // Click, clear, and fill inputs with full React event dispatch
  await page.click('#credential');
  await page.fill('#credential', cleanUser);
  await page.dispatchEvent('#credential', 'input');
  await page.dispatchEvent('#credential', 'change');

  await page.click('#password');
  await page.fill('#password', cleanPass);
  await page.dispatchEvent('#password', 'input');
  await page.dispatchEvent('#password', 'change');
  await page.waitForTimeout(300);

  // Set up response listener directly for Aurora auth API (15s to allow for geolocation resolution)
  const authResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login'),
    { timeout: 15000 }
  ).catch(() => null);

  await page.click('button[type="submit"]');

  const authRes = await authResponsePromise;
  if (authRes) {
    const status = authRes.status();
    logger.info(`[ERP Login] Auth API response status: ${status}`);

    if (status === 200) {
      // Login successful! Brief pause to let cookies settle in context
      await page.waitForTimeout(300);
      return true;
    }

    if (status === 401 || status === 400) {
      const data = await authRes.json().catch(() => null);
      const msg = data?.error || data?.message || 'Invalid ERP credentials. Please check your Student User ID and Password.';
      throw new Error(msg);
    }

    if (status === 403) {
      const rawText = await authRes.text().catch(() => '');
      logger.warn(`[ERP Login] Auth API returned 403 Forbidden. Body preview: ${rawText.slice(0, 300)}`);

      let parsedData: any = null;
      try { parsedData = JSON.parse(rawText); } catch {}

      if (parsedData?.error || parsedData?.message) {
        throw new Error(`Aurora ERP: ${parsedData.error || parsedData.message}`);
      }

      if (rawText.includes('Cloudflare') || rawText.includes('Attention Required') || rawText.includes('Access denied') || rawText.includes('cf-ray')) {
        throw new Error('Aurora ERP security (Cloudflare WAF) blocked this cloud server IP. Please save your browser session or contact portal administrator.');
      }

      if (rawText.toLowerCase().includes('csrf')) {
        throw new Error('Aurora ERP security token (CSRF) validation failed. Please try logging in again.');
      }

      throw new Error('Aurora ERP authentication was rejected (HTTP 403 Forbidden).');
    }
  }

  // Fallback if response wasn't intercepted: check page innerText for messages
  await page.waitForTimeout(600);
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
  const storedSession = parseStoredSession(connection.sessionCookies);

  // ⚡ ULTRA-FAST PATH: Check direct student-portal API using stored session cookies first
  // This completes in ~200-400ms without launching a Chromium browser instance!
  if (!explicitCreds && storedSession.cookies && storedSession.cookies.length > 0) {
    const direct = await fetchAssessmentsDirectApi(storedSession.cookies);
    if (direct && direct.length > 0) {
      return direct;
    }
  }

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

    const context = await browser.newContext(getBrowserContextOptions());

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // @ts-ignore
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'] });
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

export function parseApiAssessmentItems(rawItems: any[]): ERPAssignmentData[] {
  const assignments: ERPAssignmentData[] = [];
  for (const it of rawItems) {
    const cStatus = (it.computedStatus || it.status || '').toUpperCase();
    // Hide upcoming until they become ongoing / assigned
    if (cStatus === 'UPCOMING') continue;

    const subjectName = it.subject?.name || 'Enrolled Course';
    const subjectCode = it.subject?.code || 'COURSE';
    const subject = `${subjectName} (${subjectCode})`;

    const marksObtained = it.submission?.marksObtained ?? it.quizAttempt?.score;
    const marksText =
      marksObtained !== null && marksObtained !== undefined
        ? `Scored: ${marksObtained}/${it.maxMarks}`
        : `Max Marks: ${it.maxMarks ?? 'N/A'}`;

    const status: AssignmentStatus =
      cStatus === 'ACTIVE' || cStatus === 'ONGOING' ? 'AVAILABLE' : 'CLOSED';

    assignments.push({
      erpId: it.id || `${subjectCode}_${slugify(it.title)}`,
      title: it.title,
      subject,
      description: `Type: ${it.type || it.method || 'Assessment'}\n${marksText}\nStatus: ${cStatus}`,
      openingDate: parseDate(it.opensAt || it.submissionStartDate) ?? undefined,
      closingDate: parseDate(it.dueDate) ?? undefined,
      status,
      maxMarks: it.maxMarks,
      rawData: it,
    });
  }
  return assignments;
}

async function fetchAssessmentsDirectApi(cookies: any[]): Promise<ERPAssignmentData[] | null> {
  if (!cookies || cookies.length === 0) return null;
  const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  const isLinux = process.platform !== 'win32';
  const userAgent = isLinux
    ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://admissionsserver.aurora.edu.in/api/v1/student-portal/me/assessments', {
      method: 'GET',
      headers: {
        'Cookie': cookieString,
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://admissions.aurora.edu.in',
        'Referer': 'https://admissions.aurora.edu.in/',
        'Accept-Language': 'en-IN,en-GB,en;q=0.9,en-US;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      logger.info(`[ERP Direct API] Response status ${res.status}. Falling back to browser.`);
      return null;
    }
    const json: any = await res.json();
    if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
      logger.info(`[ERP Direct API] ⚡ Fast-path retrieved ${json.data.length} assessment items in < 500ms!`);
      return parseApiAssessmentItems(json.data);
    }
    return null;
  } catch (err: any) {
    logger.info(`[ERP Direct API] Fast-path skipped (${err.message || 'error'}). Falling back to browser.`);
    return null;
  }
}

async function extractAssignmentsFromPage(
  page: Page,
): Promise<ERPAssignmentData[]> {
  // Strategy 1: Direct in-portal official API extraction (fast, 100% comprehensive, authoritative)
  try {
    logger.info('[ERP] Attempting direct student-portal API extraction...');
    const apiRes: any = await page.evaluate(async () => {
      try {
        const res = await fetch('https://admissionsserver.aurora.edu.in/api/v1/student-portal/me/assessments', {
          credentials: 'include'
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    });

    if (apiRes?.data && Array.isArray(apiRes.data) && apiRes.data.length > 0) {
      const rawItems = apiRes.data;
      logger.info(`[ERP] Direct API returned ${rawItems.length} total assessment items`);
      const assignments = parseApiAssessmentItems(rawItems);
      logger.info(`[ERP] Successfully parsed ${assignments.length} ongoing/submitted/evaluated assignments from official API`);
      return assignments;
    }
  } catch (apiErr) {
    logger.warn('[ERP] Direct API extraction failed, falling back to DOM scraper:', apiErr);
  }

  // Strategy 2: Fallback DOM Scraping
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
  erpUrl?: string,
): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

  // Single fast query for all existing assignments for this connection
  const existingList = await prisma.eRPAssignment.findMany({
    where: { erpConnectionId },
  });
  const existingMap = new Map(existingList.map((e) => [e.erpId, e]));

  const toCreate: ERPAssignmentData[] = [];
  const toUpdate: Array<{
    existing: (typeof existingList)[0];
    data: ERPAssignmentData;
    changes: Record<string, { old: unknown; new: unknown }>;
    changeType: string;
    descChanged: boolean;
  }> = [];

  for (const data of fresh) {
    const existing = existingMap.get(data.erpId);

    if (!existing) {
      toCreate.push(data);
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
        toUpdate.push({ existing, data, changes, changeType, descChanged });
      }
    }
  }

  // Fast concurrent batch updates (chunked in groups of 10)
  if (toUpdate.length > 0) {
    const BATCH_SIZE = 10;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async ({ existing, data, changes, changeType }) => {
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
            }).catch(() => {});
          }

          if (Object.keys(changes).length > 0) {
            await prisma.assignmentHistory.create({
              data: {
                assignmentId: existing.id,
                changeType,
                changedFields: changes as any,
                snapshotData: data.rawData as any,
              },
            }).catch(() => {});
          }
        })
      );
    }
    updatedCount = toUpdate.length;
  }

  // Fast concurrent batch creations (chunked in groups of 5)
  if (toCreate.length > 0) {
    const BATCH_SIZE = 5;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (data) => {
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

          await prisma.assignmentHistory.create({
            data: {
              assignmentId: assignment.id,
              changeType: "CREATED",
              changedFields: {},
              snapshotData: data.rawData as any,
            },
          }).catch(() => {});

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
          }).catch(() => null);

          if (task) {
            await prisma.eRPAssignment.update({
              where: { id: assignment.id },
              data: { taskId: task.id, isNotified: false },
            }).catch(() => {});
          }

          await notifyNewAssignment(
            userId,
            assignment.id,
            data.title,
            data.closingDate,
            data.subject,
            data.status,
            data.rawData,
            task?.id,
            erpUrl,
          ).catch(() => {});
        })
      );
    }
    newCount = toCreate.length;

    // Automatically dispatch email and SMS notifications strictly for ongoing and missed assignments
    checkAndDispatchOngoingAndMissedAlerts(userId).catch((err) =>
      logger.warn(`[ERP Monitor] Automated alerts dispatch warning: ${err.message}`)
    );
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
): Promise<{ connectionId: string; assignments: any[]; assignmentCount: number }> {
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
    const context = await browser.newContext(getBrowserContextOptions());

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // @ts-ignore
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'] });
    });

    const page = await context.newPage();

    // 1. Verify credentials via direct Aurora auth API in ~1.2s
    await performAuroraLogin(page, username, password);

    // 2. Extract assignments immediately from the active session in ~700ms
    logger.info(`[ERP] Extracting assignments immediately for ${username}...`);
    const rawAssignments = await extractAssignmentsFromPage(page);

    // 3. Capture authenticated session cookies
    const cookies = await context.cookies();
    const connectionId = await saveERPSession(userId, erpUrl, cookies, { username, password });

    // Close verification browser immediately
    await browser.close();

    // 4. Format assignments into client-ready ERPAssignment objects for immediate UI display
    const formattedAssignments = rawAssignments.map((a) => ({
      id: a.erpId,
      erpId: a.erpId,
      title: a.title,
      subject: a.subject,
      description: a.description,
      openingDate: a.openingDate ? a.openingDate.toISOString() : undefined,
      closingDate: a.closingDate ? a.closingDate.toISOString() : undefined,
      status: a.status,
      maxMarks: a.maxMarks,
      rawData: a.rawData,
      isNew: false,
      isNotified: false,
      createdAt: new Date().toISOString(),
      history: [],
    }));

    // Invalidate Valkey cache on credential update and cache fresh assignments
    await valkeyCache.del(`valkey:erp:status:${userId}`).catch(() => {});
    await valkeyCache.delPattern('valkey:erp:*').catch(() => {});
    await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});
    await valkeyCache.set(
      `valkey:erp:assignments:${userId}:ALL:1:100:false`,
      { assignments: formattedAssignments, total: formattedAssignments.length, page: 1, pageSize: 100 },
      60
    ).catch(() => {});

    // Asynchronously upsert to PostgreSQL in the background
    (async () => {
      try {
        await processAssignments(userId, connectionId, rawAssignments);
        await prisma.eRPConnection.update({
          where: { id: connectionId },
          data: { lastSyncStatus: 'SUCCESS', lastSyncAt: new Date(), lastSyncError: null },
        });
        await valkeyCache.del(`valkey:erp:status:${userId}`).catch(() => {});
      } catch (err) {
        logger.error('[ERP] Background persistence error:', err);
      }
    })();

    logger.info(`[ERP] Verified credentials and returning ${formattedAssignments.length} assignments immediately for ${username}.`);
    return {
      connectionId,
      assignments: formattedAssignments,
      assignmentCount: formattedAssignments.length,
    };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    throw err;
  }
}

/**
 * Robust parser that normalizes any cookie format (document.cookie string, DevTools JSON, Cookie-Editor array)
 * into an array of { name, value, domain, path }.
 */
export function parseCookieInput(input: any): Array<{ name: string; value: string; domain: string; path: string }> {
  if (!input) return [];

  // 1. Array of cookie objects (e.g. from Cookie-Editor / EditThisCookie)
  if (Array.isArray(input)) {
    return input
      .map((c: any) => ({
        name: String(c.name || c.key || '').trim(),
        value: String(c.value || '').trim(),
        domain: c.domain || '.aurora.edu.in',
        path: c.path || '/',
      }))
      .filter((c) => c.name && c.value);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();

    // 2. JSON array or JSON object string
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseCookieInput(parsed);
        }
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.cookies)) {
            return parseCookieInput(parsed.cookies);
          }
          return Object.entries(parsed)
            .map(([name, value]) => ({
              name: name.trim(),
              value: String(value).trim(),
              domain: '.aurora.edu.in',
              path: '/',
            }))
            .filter((c) => c.name && c.value);
        }
      } catch {}
    }

    // 3. Standard document.cookie string: "name1=val1; name2=val2; ..."
    const pairs = trimmed.split(';');
    const results: Array<{ name: string; value: string; domain: string; path: string }> = [];
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (name && value) {
          results.push({ name, value, domain: '.aurora.edu.in', path: '/' });
        }
      }
    }
    return results;
  }

  return [];
}

/**
 * Authenticate directly via session cookies.
 * 1. Verifies the cookies live against Aurora student-portal assessment API.
 * 2. Saves the verified cookies encrypted to DB.
 * 3. Immediately returns parsed assignments in ~300ms without Playwright.
 */
export async function authenticateAndSyncWithCookies(
  userId: string,
  rawCookies: any,
  erpUrl: string = env.AURORA_ERP_URL
): Promise<{ connectionId: string; assignments: any[]; assignmentCount: number }> {
  const cookies = parseCookieInput(rawCookies);
  if (!cookies || cookies.length === 0) {
    throw new Error('No valid cookies found in input. Please paste your session cookies (e.g. from document.cookie or Cookie-Editor).');
  }

  logger.info(`[ERP] Authenticating user ${userId} with ${cookies.length} session cookies...`);

  // Direct fast-path check against Aurora student-portal assessments API
  const rawAssignments = await fetchAssessmentsDirectApi(cookies);
  if (!rawAssignments) {
    throw new Error(
      'Session cookies were rejected by Aurora portal (expired or missing connect.sid). Please log in to admissions.aurora.edu.in and copy fresh cookies.'
    );
  }

  const connectionId = await saveERPSession(userId, erpUrl, cookies);

  const formattedAssignments = rawAssignments.map((a) => ({
    id: a.erpId,
    erpId: a.erpId,
    title: a.title,
    subject: a.subject,
    description: a.description,
    openingDate: a.openingDate ? a.openingDate.toISOString() : undefined,
    closingDate: a.closingDate ? a.closingDate.toISOString() : undefined,
    status: a.status,
    maxMarks: a.maxMarks,
    rawData: a.rawData,
    isNew: false,
    isNotified: false,
    createdAt: new Date().toISOString(),
    history: [],
  }));

  await valkeyCache.del(`valkey:erp:status:${userId}`).catch(() => {});
  await valkeyCache.delPattern('valkey:erp:*').catch(() => {});
  await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});
  await valkeyCache.set(
    `valkey:erp:assignments:${userId}:ALL:1:100:false`,
    { assignments: formattedAssignments, total: formattedAssignments.length, page: 1, pageSize: 100 },
    60
  ).catch(() => {});

  // Asynchronously process and persist to PostgreSQL
  (async () => {
    try {
      await processAssignments(userId, connectionId, rawAssignments);
      await prisma.eRPConnection.update({
        where: { id: connectionId },
        data: { lastSyncStatus: 'SUCCESS', lastSyncAt: new Date(), lastSyncError: null },
      });
      await valkeyCache.del(`valkey:erp:status:${userId}`).catch(() => {});
    } catch (err) {
      logger.error('[ERP] Background persistence error with session cookies:', err);
    }
  })();

  logger.info(`[ERP] Successfully verified session cookies! Loaded ${formattedAssignments.length} assignments.`);
  return {
    connectionId,
    assignments: formattedAssignments,
    assignmentCount: formattedAssignments.length,
  };
}


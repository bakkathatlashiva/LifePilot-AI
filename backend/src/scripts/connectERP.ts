import { chromium } from 'playwright';
import { prisma } from '../config/database';
import { saveERPSession, runERPSync } from '../services/erp/erpMonitor';
import { env } from '../config/env';
import { logger } from '../utils/logger';

async function main() {
  const user = await prisma.user.findFirst();

  if (!user) {
    console.error('❌ User not found. Please log in first via the web dashboard.');
    process.exit(1);
  }

  console.log('🌐 Launching browser for Aurora ERP login...');
  console.log('   Please log in with your college Google account in the browser window.');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use local Chrome if available, or defaults to bundled chromium
  }).catch(() => chromium.launch({ headless: false }));

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(env.AURORA_ERP_URL);

  console.log('⏳ Waiting for you to finish logging in...');

  // Wait until user is redirected back to Sidus ERP and not on Google login
  await page.waitForURL((url) => {
    const u = url.toString();
    return (u.includes('sidus.net') || u.includes('admissions.aurora.edu.in')) && !u.includes('accounts.google.com') && !u.includes('login');
  }, { timeout: 180000 }); // 3 minutes timeout

  // Wait a few seconds for all session cookies to settle
  await page.waitForTimeout(3000);

  const cookies = await context.cookies();
  console.log(`✅ Captured ${cookies.length} session cookies from Aurora ERP!`);

  await browser.close();

  console.log('💾 Encrypting and saving session to PostgreSQL...');
  const connectionId = await saveERPSession(user.id, env.AURORA_ERP_URL, cookies);
  console.log(`✅ Connection updated (${connectionId}). Running initial sync...`);

  await runERPSync(connectionId);
  console.log('🎉 ERP synchronization complete! Check your LifePilot dashboard.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Connection script error:', err.message);
  process.exit(1);
});


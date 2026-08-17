import { chromium } from 'playwright';
import fs from 'fs';

const shotDir = '/private/tmp/claude-501/-Users-abel-elreaper-Desktop-projects-lorekeeper/14b563ae-4061-4911-885b-f4f7d5b1c27f/scratchpad/shots';
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 12/13-ish
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

const log = (...args) => console.log(...args);

try {
  log('Navigating to /demo to establish guest + mock-data session...');
  await page.goto('http://localhost:5173/demo', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shotDir}/01-demo-landing.png` });

  log('Navigating to /love (Dating & Romance)...');
  await page.goto('http://localhost:5173/love', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shotDir}/02-love-page.png` });

  log('Current URL after nav:', page.url());

  // Try to find a clickable relationship/character card to open the detail modal.
  const cardSelectors = [
    '[data-testid*="relationship-card"]',
    '[data-testid*="character-card"]',
    'button:has-text("Jamie")',
    'button:has-text("Elena")',
    '[role="button"]:has-text("View")',
  ];

  let opened = false;
  for (const sel of cardSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      log('Clicking selector:', sel);
      await el.click({ timeout: 5000 }).catch((e) => log('click failed', sel, e.message));
      await page.waitForTimeout(1500);
      opened = true;
      break;
    }
  }

  if (!opened) {
    log('No known card selector matched — dumping page text for diagnosis.');
    const bodyText = await page.locator('body').innerText().catch(() => '(failed to get text)');
    fs.writeFileSync(`${shotDir}/love-page-text.txt`, bodyText);
  }

  await page.screenshot({ path: `${shotDir}/03-after-click.png` });
  log('Console errors so far:', consoleErrors.slice(0, 20));
} catch (e) {
  log('ERROR during script:', e.message);
} finally {
  await browser.close();
}

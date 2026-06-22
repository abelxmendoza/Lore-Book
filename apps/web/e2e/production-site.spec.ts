import { test, expect } from '@playwright/test';

/**
 * Live production smoke — runs against PLAYWRIGHT_BASE_URL (e.g. https://lorebookai.com).
 * Asserts the landing page loads, renders content, and does not emit critical console errors.
 */

const IGNORED_CONSOLE_PATTERNS = [
  /127\.0\.0\.1:7242/, // local debug ingest
  /favicon\.ico/i,
  /Content-Security-Policy-Report-Only/i,
  /script-src-elem 'none'/i, // Vercel/platform report-only probe — not our enforcing CSP
  /font-src 'none'/i,
  /frame-src 'none'/i,
  /Failed to load resource.*favicon/i,
  /ERR_BLOCKED_BY_CLIENT/i, // ad blockers (Sentry, etc.)
  /runtime\.lastError/i, // browser extensions
];

function isIgnoredConsoleMessage(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

test.describe('Production Site Smoke', () => {
  test.beforeEach(async () => {
    test.setTimeout(45000);
  });

  test('landing page loads with visible content and no critical console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isIgnoredConsoleMessage(text)) consoleErrors.push(text);
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.locator('#root')).toBeVisible();

    const base = process.env.PLAYWRIGHT_BASE_URL ?? '';
    const isProductionHost = /lorebookai\.com/i.test(base);
    if (isProductionHost) {
      const devNotice = page.getByRole('heading', { name: /Welcome to Lore Book/i });
      await expect(devNotice).toBeVisible({ timeout: 5000 });
      await page.getByRole('button', { name: /got it/i }).click();
      await expect(devNotice).toHaveCount(0);
    }

    const heroHeadline = page.getByTestId('hero-rotating-headline');
    await expect(heroHeadline).toBeVisible();
    await expect
      .poll(async () => {
        const text = (await heroHeadline.locator('h1').textContent()) ?? '';
        return /remembers|noted|learns who you are|autobiographer/i.test(text);
      })
      .toBe(true);

    const critical = [...consoleErrors, ...pageErrors].filter(
      (message) =>
        message.includes('forwardRef') ||
        message.includes("can't access property") ||
        message.includes('ReferenceError') ||
        message.includes('TypeError') ||
        message.includes('[ROUTING]'),
    );

    expect(critical).toEqual([]);
  });

  test('health endpoint responds through Vercel rewrite', async ({ request, baseURL }) => {
    const origin = baseURL?.replace(/\/+$/, '') ?? 'https://lorebookai.com';
    const response = await request.get(`${origin}/api/health`, { timeout: 15000 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });
});

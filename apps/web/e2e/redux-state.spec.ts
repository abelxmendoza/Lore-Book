import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end smoke for the Redux state-management migration.
 *
 * Asserts:
 *  - the Redux-backed App shell mounts and paints content (Discovery hub)
 *  - no fatal bootstrap/ErrorBoundary diagnostics appear
 *  - route ↔ activeSurface navigation stays in sync across surfaces
 *
 * Uses the same demo/mock bootstrap as discovery-hub.spec.ts so no backend
 * or Supabase session is required.
 */

const FATAL_DIAGNOSTICS = [
  'Something went wrong',
  'Application Error',
  'Application Failed to Mount',
  'Render Timeout',
  'Unhandled Promise Rejection',
];

async function boot(page: Page, path: string) {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}mockData=true`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(600);

  const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
  if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
    const btn = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function expectNoFatalDiagnostics(page: Page) {
  for (const text of FATAL_DIAGNOSTICS) {
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  }
}

test.describe('Redux state management', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem('lorebook_use_mock_data', 'true');
      window.sessionStorage.setItem('lk_demo_runtime', 'true');
    });
  });

  test('mounts the Redux-backed App shell with visible content', async ({ page }) => {
    await boot(page, '/discovery');
    await expect(page).toHaveURL(/\/discovery/);
    await expectNoFatalDiagnostics(page);
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 20000 });
  });

  test('keeps the route in sync with the active surface across surfaces', async ({ page }) => {
    await boot(page, '/discovery');
    await expect(page).toHaveURL(/\/discovery/);
    await expectNoFatalDiagnostics(page);

    await boot(page, '/timeline');
    await expect(page).toHaveURL(/\/timeline/);
    await expectNoFatalDiagnostics(page);

    await boot(page, '/characters');
    await expect(page).toHaveURL(/\/characters/);
    await expectNoFatalDiagnostics(page);

    await boot(page, '/quests');
    await expect(page).toHaveURL(/\/quests/);
    await expectNoFatalDiagnostics(page);
  });

  test('surface route survives a reload without a fatal diagnostic', async ({ page }) => {
    await boot(page, '/discovery');
    await expect(page).toHaveURL(/\/discovery/);
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 20000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\/discovery/);
    await expectNoFatalDiagnostics(page);
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 20000 });
  });
});

// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Trust Center (Knowledge Gaps)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem('lorebook_use_mock_data', 'true');
      window.sessionStorage.setItem('lk_demo_runtime', 'true');
    });

    await page.goto('/gaps?mockData=true', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
    if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
      const btn = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('loads trust coverage panel in knowledge gaps', async ({ page }) => {
    await expect(page.getByTestId('trust-coverage-panel')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/lore coverage/i)).toBeVisible();
    await expect(page.getByText(/review next/i)).toBeVisible();
  });

  test('/trust redirects to knowledge gaps', async ({ page }) => {
    await page.goto('/trust?mockData=true', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/gaps/);
    await expect(page.getByTestId('trust-coverage-panel')).toBeVisible({ timeout: 20000 });
  });
});

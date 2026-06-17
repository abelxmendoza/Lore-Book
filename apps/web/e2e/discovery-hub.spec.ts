// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Discovery Hub — panels and navigation', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem('lorebook_use_mock_data', 'true');
    });

    await page.goto('/discovery?mockData=true');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
    if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
      const btn = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }

    await page.waitForSelector('[data-testid="discovery-overview"]', { timeout: 15000 }).catch(() => {});
  });

  test('loads overview with insight and data sections', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/insights about you/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /data & control/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /soul profile/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continuity intelligence/i })).toBeVisible();
  });

  test('navigates to soul profile panel', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /soul profile/i }).click();
    await expect(page).toHaveURL(/\/discovery\/soul-profile/);
  });

  test('navigates to life arc panel', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /recent moments|life arc/i }).click();
    await expect(page).toHaveURL(/\/discovery\/life-arc/);
  });

  test('navigates to continuity dashboard with mock data', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /continuity intelligence/i }).click();
    await expect(page).toHaveURL(/\/discovery\/continuity/);
    await expect(page.getByTestId('continuity-dashboard')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/contradictions/i).first()).toBeVisible();
  });

  test('navigates to achievements panel via sidebar', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: /achievements/i }).click();
    await expect(page).toHaveURL(/\/discovery\/achievements/);
  });

  test('sidebar discovery nav links work', async ({ page }) => {
    await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 10000 });
    const sidebarLink = page.getByRole('link', { name: /relationships/i }).first();
    await sidebarLink.click();
    await expect(page).toHaveURL(/\/discovery\/relationships/);
  });
});

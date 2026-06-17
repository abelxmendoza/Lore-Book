// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { test, expect, type Page } from '@playwright/test';

async function bootstrapDiscoveryDemo(page: Page) {
  await page.goto('/discovery?mockData=true', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
  if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
    const btn = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  await expect(page.getByTestId('discovery-overview')).toBeVisible({ timeout: 20000 });
}

async function openPanelFromOverview(page: Page, name: RegExp) {
  const card = page.getByRole('button', { name }).first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
}

test.describe('Discovery Hub — panels and navigation', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem('lorebook_use_mock_data', 'true');
      window.sessionStorage.setItem('lk_demo_runtime', 'true');
    });

    await bootstrapDiscoveryDemo(page);
  });

  test('loads overview with insight and data sections', async ({ page }) => {
    await expect(page.getByText(/insights about you/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /data & control/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /soul profile/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continuity intelligence/i })).toBeVisible();
  });

  test('navigates to soul profile panel', async ({ page }) => {
    await openPanelFromOverview(page, /soul profile/i);
    await expect(page).toHaveURL(/\/discovery\/soul-profile/);
  });

  test('navigates to life arc panel', async ({ page }) => {
    await openPanelFromOverview(page, /recent moments|life arc/i);
    await expect(page).toHaveURL(/\/discovery\/life-arc/);
  });

  test('navigates to continuity dashboard with mock data', async ({ page }) => {
    await page.goto('/discovery/continuity?mockData=true', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('continuity-dashboard')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('continuity-dashboard').getByRole('tab', { name: /contradictions/i })).toBeVisible();
  });

  test('achievements panel loads', async ({ page }) => {
    await page.goto('/discovery/achievements?mockData=true', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^achievements$/i })).toBeVisible({ timeout: 25000 });
  });

  test('relationships panel loads', async ({ page }) => {
    await page.goto('/discovery/relationships?mockData=true', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/discovery\/relationships/);
    await expect(page.getByTestId('periphery-intelligence-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/vicarious network intelligence/i)).toBeVisible();
  });

  test('sidebar discovery nav links work on desktop', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('Mobile'),
      'Discovery sidebar is hidden below the lg breakpoint'
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await bootstrapDiscoveryDemo(page);

    const sidebarLink = page.getByRole('link', { name: /^relationships$/i });
    await sidebarLink.scrollIntoViewIfNeeded();
    await sidebarLink.click();
    await expect(page).toHaveURL(/\/discovery\/relationships/);
  });
});

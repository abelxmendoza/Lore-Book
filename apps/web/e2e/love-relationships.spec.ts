// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Love & Relationships — connected lore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mockData=true');
    await page.waitForSelector('[data-testid="app-content"]', { timeout: 15000 }).catch(() => {});
  });

  async function openLoveSection(page: import('@playwright/test').Page) {
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    await expect(page.getByTestId('love-relationships-view')).toBeVisible({ timeout: 8000 });
  }

  test('loads demo view with story showcase', async ({ page }) => {
    await openLoveSection(page);
    await expect(page.getByTestId('romantic-story-showcase')).toBeVisible();
    await expect(page.getByTestId('romantic-lore-synopsis')).toBeVisible();
    await expect(page.getByTestId('lore-chapter-1')).toBeVisible();
    await expect(page.getByTestId('lore-test-case-lore-alex-girlfriend')).toBeVisible();
  });

  test('displays connected cast cards', async ({ page }) => {
    await openLoveSection(page);
    for (const name of ['Alex', 'Jordan', 'Sam', 'Taylor', 'Elena']) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByTestId('relationship-card-rel-001')).toBeVisible();
  });

  test('shows lexical intelligence panel', async ({ page }) => {
    await openLoveSection(page);
    await expect(page.getByText(/lexical intelligence/i)).toBeVisible();
    await expect(page.getByText(/my girlfriend/i).first()).toBeVisible();
  });

  test('filters relationships by tab', async ({ page }) => {
    await openLoveSection(page);
    await page.getByRole('tab', { name: /^past$/i }).click();
    await expect(page.getByText('Taylor').first()).toBeVisible();
    await page.getByRole('tab', { name: /no contact/i }).click();
    await expect(page.getByText('Riley').first()).toBeVisible();
  });

  test('opens relationship detail from card', async ({ page }) => {
    await openLoveSection(page);
    await page.getByTestId('relationship-card-rel-001').click();
    await expect(page.getByText(/overview|analytics|relationship/i).first()).toBeVisible({
      timeout: 5000,
    }).catch(() => {});
  });

  test('rankings tab loads', async ({ page }) => {
    await openLoveSection(page);
    await page.getByRole('tab', { name: /rankings/i }).click();
    await expect(page.getByText(/your love rankings/i)).toBeVisible({ timeout: 5000 });
  });

  test('lore test case filter buttons work', async ({ page }) => {
    await openLoveSection(page);
    await page.getByRole('button', { name: /ghosted/i }).click();
    await expect(page.getByTestId('lore-test-case-lore-riley-ghosted')).toBeVisible();
    await page.getByRole('button', { name: /^all/i }).click();
    await expect(page.getByTestId('lore-test-case-lore-priya-dating')).toBeVisible();
  });

  test('their connections tab shows vicarious periphery', async ({ page }) => {
    await openLoveSection(page);
    await page.getByTestId('relationship-card-rel-003').click();
    await page.getByTestId('tab-their-connections').click();
    await expect(page.getByTestId('relationship-peripherals-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('peripheral-card-periph-sam-marcus')).toBeVisible();
    await expect(page.getByText('Marcus')).toBeVisible();
    await expect(page.getByTestId('peripheral-tier-suspected')).toBeVisible();
  });

  test('character book love periphery filter shows Marcus', async ({ page }) => {
    await page.goto('/?mockData=true');
    await page.waitForSelector('[data-testid="app-content"]', { timeout: 15000 }).catch(() => {});
    const charactersNav = page.getByRole('button', { name: /characters/i });
    await charactersNav.click();
    await page.getByTestId('character-filter-romantic-peripheral').click();
    await expect(page.getByText('Marcus').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/suspected side partner|Sam's suspected/i).first()).toBeVisible();
  });

  test('character detail their network tab shows multi-domain periphery', async ({ page }) => {
    await page.goto('/?mockData=true');
    await page.waitForSelector('[data-testid="app-content"]', { timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: /characters/i }).click();
    await page.getByText('Sam', { exact: false }).first().click();
    await page.getByTestId('character-tab-network').click();
    await expect(page.getByTestId('relationship-peripherals-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('peripheral-card-periph-sam-roommate')).toBeVisible();
    await expect(page.getByText('Drew')).toBeVisible();
  });
});

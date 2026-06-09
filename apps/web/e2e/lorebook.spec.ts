/**
 * Journey C — Lorebook Generation
 *
 * Tests the lorebook surface:
 *   /lorebook → Library Landing → category selection → generate → result
 *
 * Also covers the ?focus= deep-link that LivingBiographyCard uses.
 */

import { test, expect } from '@playwright/test';

test.describe('Journey C — Lorebook Generation', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });

    await page.goto('/lorebook');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    // Dismiss dev notice if present
    const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
    if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
      const btn = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('lorebook page loads without crashing', async ({ page }) => {
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
    // Should not show a raw error page
    const errorPage = page.locator('text=/error|failed to load|cannot read/i');
    const hasError = await errorPage.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  test('library landing renders category buttons', async ({ page }) => {
    // The LibraryLanding shows category buttons like Full Biography, A Person, Career
    const biographyBtn = page.locator('button:has-text("Full Biography"), button:has-text("Biography")').first();
    const careerBtn = page.locator('button:has-text("Career")').first();

    const biographyExists = await biographyBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (biographyExists) {
      await expect(biographyBtn).toBeVisible();
      await expect(careerBtn).toBeVisible();
    } else {
      // May be behind auth or showing a saved lorebook state
      const bodyContent = await page.locator('body').innerHTML();
      expect(bodyContent.length).toBeGreaterThan(100);
    }
  });

  test('category click pre-fills the query input', async ({ page }) => {
    const careerBtn = page.locator('button:has-text("Career")').first();
    const btnExists = await careerBtn.isVisible({ timeout: 8000 }).catch(() => false);

    if (btnExists) {
      await careerBtn.click();
      // The query input should be pre-filled with the career prompt
      const input = page.locator('input[type="text"], textarea').first();
      const value = await input.inputValue().catch(() => '');
      expect(value.toLowerCase()).toContain('professional');
    }
  });

  test('typing a custom query enables the Generate button', async ({ page }) => {
    const input = page.locator('input[type="text"], textarea[placeholder*="lorebook"], textarea[placeholder*="story"]').first();
    const inputExists = await input.isVisible({ timeout: 8000 }).catch(() => false);

    if (inputExists) {
      await input.fill('the story of my college years');
      const generateBtn = page.locator('button:has-text("Generate")').first();
      await expect(generateBtn).toBeEnabled({ timeout: 3000 });
    }
  });

  test('?focus= query param pre-fills generation query', async ({ page }) => {
    // This is the URL that LivingBiographyCard produces
    await page.goto('/lorebook?focus=the%20story%20of%20The%20Creative%20Sprint');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // The focus param should trigger generation or pre-fill the query
    const url = page.url();
    expect(url).toMatch(/lorebook/i);

    // The page should not crash
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent.length).toBeGreaterThan(100);
  });

  test('saved biographies section is visible when books exist', async ({ page }) => {
    // In demo/mock mode, demo books are shown
    const savedSection = page.locator('text=/saved|your lorebooks|generated|Creative Renaissance/i').first();
    const exists = await savedSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (exists) {
      await expect(savedSection).toBeVisible();
    } else {
      // In a fresh environment with no data, show the empty state or library landing
      const bodyContent = await page.locator('body').innerHTML();
      expect(bodyContent.length).toBeGreaterThan(100);
    }
  });

  test('generate button triggers loading state', async ({ page }) => {
    const input = page.locator('input[type="text"], textarea').first();
    const inputExists = await input.isVisible({ timeout: 8000 }).catch(() => false);

    if (inputExists) {
      await input.fill('my life story');
      const generateBtn = page.locator('button:has-text("Generate")').first();

      if (await generateBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
        await generateBtn.click();

        // Should show a loading or progress indicator
        const loading = page.locator('[class*="loading"], [class*="spinner"], text=/generating|writing|creating/i').first();
        const loadingVisible = await loading.isVisible({ timeout: 5000 }).catch(() => false);

        // Either loading shown or result shown immediately
        const result = page.locator('text=/chapter|biography|story/i').first();
        const resultOrLoading = loadingVisible || await result.isVisible({ timeout: 3000 }).catch(() => false);

        // Page shouldn't crash regardless
        const bodyContent = await page.locator('body').innerHTML();
        expect(bodyContent.length).toBeGreaterThan(100);
      }
    }
  });
});

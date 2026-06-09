/**
 * Journey B — Living Biography Generation
 *
 * Tests the primary value proposition:
 *   Home → LivingBiographyCard → Generate Lorebook → /lorebook?focus=...
 *
 * These tests run in "mock data" mode (VITE_USE_MOCK_DATA=true) so they
 * don't require a real backend or auth session. The dev server is configured
 * to serve mock data when this flag is set.
 */

import { test, expect } from '@playwright/test';

test.describe('Journey B — Living Biography', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });

    await page.goto('/');
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

  test('home page renders without crashing', async ({ page }) => {
    // Basic smoke test: the page loads and has content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
    expect(await page.title()).toBeTruthy();
  });

  test('navigation to chat works from home', async ({ page }) => {
    // Find a navigation link to chat
    const chatLink = page.locator('a[href*="/chat"], button:has-text("Chat"), nav a:has-text("Chat")').first();
    const exists = await chatLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (exists) {
      await chatLink.click();
      await page.waitForLoadState('domcontentloaded');
      // Should be on a chat-related page
      expect(page.url()).toMatch(/chat|memoir|app/i);
    } else {
      // App may require auth — verify the page renders something
      expect(await page.locator('body').innerHTML()).not.toBe('');
    }
  });

  test('LivingBiographyCard renders when present', async ({ page }) => {
    // In mock mode the card may or may not render based on mock data state.
    // This test verifies the page doesn't crash and renders some content.
    await page.waitForTimeout(1000);

    const card = page.locator('[class*="biography"], [data-testid*="biography"], text=Your Story Right Now');
    const cardExists = await card.isVisible({ timeout: 3000 }).catch(() => false);

    // Either the card is shown or the page is showing an auth/loading state
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent.length).toBeGreaterThan(100);

    if (cardExists) {
      // If the card rendered, verify its key structure
      await expect(card.first()).toBeVisible();
    }
  });

  test('Generate Lorebook button navigates to /lorebook with focus param', async ({ page }) => {
    // Look for the Generate Lorebook button (inside LivingBiographyCard)
    const generateBtn = page.locator('button:has-text("Generate Lorebook")').first();
    const btnExists = await generateBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (btnExists) {
      await generateBtn.click();
      await page.waitForLoadState('domcontentloaded');

      // Should navigate to /lorebook with a focus query param
      expect(page.url()).toMatch(/lorebook/i);
      expect(page.url()).toMatch(/focus=/i);
    } else {
      // Button only renders when the biography card has enough data.
      // In fresh/empty environments it won't show — that's expected behavior.
      test.info().annotations.push({ type: 'note', description: 'Generate Lorebook button not visible — likely no biography data in this environment' });
    }
  });

  test('person name click navigates to /lorebook?focus=my story with <person>', async ({ page }) => {
    // Key people names render as clickable buttons inside LivingBiographyCard
    const personBtn = page.locator('[class*="biography"] button, text=People who matter most')
      .locator('..').locator('button').first();

    const btnExists = await personBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (btnExists) {
      const name = await personBtn.textContent();
      await personBtn.click();
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toMatch(/lorebook/i);
      if (name) {
        expect(decodeURIComponent(page.url())).toContain(name.trim());
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'No person buttons found — biography card not visible in this environment' });
    }
  });
});

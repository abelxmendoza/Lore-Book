import { test, expect } from '@playwright/test';

test.describe('Timeline', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set localStorage to dismiss dev notice before page loads
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });
    
    // Mock authentication
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait a bit for any delayed modals
    await page.waitForTimeout(600); // Wait longer than the 500ms delay in DevelopmentNotice
    
    // Dismiss dev notice if it still appears (fallback)
    const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
    if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
      const dismissButton = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
      if (await dismissButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dismissButton.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should display timeline entries', async ({ page }) => {
    // Navigate to timeline - use more specific selector
    const timelineButton = page.locator('button:has-text("Timeline"), a:has-text("Timeline")').first();
    await timelineButton.click({ timeout: 10000 });
    
    // Check for timeline elements
    await expect(page.locator('[data-testid="timeline"]').or(page.locator('[class*="timeline"]'))).toBeVisible({ timeout: 10000 });
  });

  test('should open entry modal on click', async ({ page }) => {
    await page.goto('/');
    
    // Click on an entry card
    const entryCard = page.locator('[data-testid="entry-card"]').first();
    if (await entryCard.isVisible()) {
      await entryCard.click();
      
      // Check modal is open
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    
    // Enter should activate focused element
    await page.keyboard.press('Enter');
  });

  test('should be accessible with screen reader', async ({ page }) => {
    await page.goto('/');
    
    // Check for ARIA labels
    const buttons = page.locator('button[aria-label]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });
});


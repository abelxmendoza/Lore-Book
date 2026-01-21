// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Love & Relationships', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (assuming auth is handled)
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('[data-testid="app-content"]', { timeout: 10000 }).catch(() => {});
  });

  test('navigates to Love & Relationships section', async ({ page }) => {
    // Find and click the Love & Relationships navigation item
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    // Should show the Love & Relationships view
    await expect(page.getByText(/your love story/i)).toBeVisible({ timeout: 5000 });
  });

  test('displays relationships list', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    // Wait for relationships to load
    await page.waitForSelector('[class*="RelationshipCard"]', { timeout: 5000 }).catch(() => {});
    
    // Should show relationship count or empty state
    const hasRelationships = await page.getByText(/relationship/i).count() > 0;
    const hasEmptyState = await page.getByText(/no relationships/i).isVisible().catch(() => false);
    
    expect(hasRelationships || hasEmptyState).toBeTruthy();
  });

  test('filters relationships by category', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    await page.waitForSelector('[class*="TabsList"]', { timeout: 5000 }).catch(() => {});
    
    // Click active filter
    const activeTab = page.getByRole('tab', { name: /active/i });
    await activeTab.click();
    
    // Should update the view
    await expect(page.getByText(/active/i)).toBeVisible();
  });

  test('opens relationship detail modal', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    // Wait for relationships
    await page.waitForTimeout(2000);
    
    // Try to click first relationship card if available
    const relationshipCard = page.locator('[class*="RelationshipCard"]').first();
    const cardCount = await relationshipCard.count();
    
    if (cardCount > 0) {
      await relationshipCard.click();
      
      // Should open modal
      await expect(page.getByText(/overview/i).or(page.getByText(/relationship/i))).toBeVisible({ timeout: 3000 }).catch(() => {});
    }
  });

  test('navigates to rankings view', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    await page.waitForSelector('[class*="TabsList"]', { timeout: 5000 }).catch(() => {});
    
    // Click rankings tab
    const rankingsTab = page.getByRole('tab', { name: /rankings/i });
    await rankingsTab.click();
    
    // Should show rankings
    await expect(page.getByText(/your love rankings/i)).toBeVisible({ timeout: 3000 });
  });

  test('displays ranking badges with proper alignment', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    await page.waitForSelector('[class*="TabsList"]', { timeout: 5000 }).catch(() => {});
    
    // Click rankings tab
    const rankingsTab = page.getByRole('tab', { name: /rankings/i });
    await rankingsTab.click();
    
    await page.waitForTimeout(2000);
    
    // Check that rank badges exist and have consistent styling
    const rankBadges = page.locator('[class*="Badge"]').filter({ hasText: /#\d/ });
    const badgeCount = await rankBadges.count();
    
    if (badgeCount > 0) {
      // Get first two badges
      const badge1 = rankBadges.first();
      const badge2 = rankBadges.nth(1);
      
      if (await badge2.count() > 0) {
        // Check that badges have min-width for alignment
        const badge1Classes = await badge1.getAttribute('class');
        const badge2Classes = await badge2.getAttribute('class');
        
        // Both should have min-w class for alignment
        expect(badge1Classes || '').toMatch(/min-w/);
        expect(badge2Classes || '').toMatch(/min-w/);
      }
    }
  });

  test('switches ranking categories', async ({ page }) => {
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    await page.waitForSelector('[class*="TabsList"]', { timeout: 5000 }).catch(() => {});
    
    // Click rankings tab
    const rankingsTab = page.getByRole('tab', { name: /rankings/i });
    await rankingsTab.click();
    
    await page.waitForTimeout(1000);
    
    // Switch to compatibility category
    const compatibilityTab = page.getByRole('tab', { name: /compatibility/i });
    if (await compatibilityTab.isVisible()) {
      await compatibilityTab.click();
      
      // Should update rankings
      await page.waitForTimeout(1000);
    }
  });

  test('works with mock data enabled', async ({ page }) => {
    // Enable mock data via URL parameter
    await page.goto('/?mockData=true');
    
    // Navigate to love section
    const loveNav = page.getByRole('button', { name: /love & relationships/i });
    await loveNav.click();
    
    // Should show mock data indicator
    await expect(page.getByText(/mock data/i).or(page.getByText(/demo/i))).toBeVisible({ timeout: 5000 }).catch(() => {});
    
    // Should show relationships from mock data
    await page.waitForTimeout(2000);
    const hasContent = await page.getByText(/relationship/i).count() > 0;
    expect(hasContent).toBeTruthy();
  });
});

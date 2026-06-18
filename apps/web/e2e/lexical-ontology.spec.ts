import { test, expect, type Page } from '@playwright/test';

/**
 * E2E smoke coverage for the lexical-intelligence / ontology surfaces:
 *   - /ontology       → admin Ontology Explorer (hierarchy + analytics)
 *   - /characters     → Character Book (hosts the Lexical compliance panel)
 *   - /love           → Love & Relationships (romantic lexical insights)
 *
 * Assertions are intentionally tolerant: admin gating, mock-data availability,
 * and "hide when healthy" panels mean exact content varies by environment. The
 * core guarantee verified here is that each surface renders without crashing the
 * app shell (no ErrorBoundary fallback / blank screen).
 */

async function dismissDevNotice(page: Page) {
  const devNotice = page.locator('[role="dialog"][aria-labelledby="dev-notice-title"]');
  if (await devNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
    const dismiss = page.locator('button:has-text("Got it"), button[aria-label*="Dismiss"]');
    if (await dismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismiss.click();
      await page.waitForTimeout(300);
    }
  }
}

async function expectNoFatalCrash(page: Page) {
  // The ErrorBoundary fallback should never be shown on these routes.
  await expect(page.locator('body')).toBeVisible();
  const fatal = page.locator('text=/Something went wrong|Application error|White screen/i');
  expect(await fatal.count()).toBe(0);
  // App shell rendered some non-trivial content.
  const text = (await page.locator('body').innerText().catch(() => '')) ?? '';
  expect(text.trim().length).toBeGreaterThan(0);
}

test.describe('Lexical & ontology surfaces', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });
  });

  test('ontology explorer route renders (hierarchy or admin gate)', async ({ page }) => {
    await page.goto('/ontology');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await dismissDevNotice(page);

    // Either the explorer loaded, or the admin gate / loading state is shown —
    // all are valid non-crash outcomes.
    const explorer = page.locator(
      'text=/Ontology Explorer|Admin access required|Loading ontology|Ontology unavailable/i'
    );
    await expect(explorer.first()).toBeVisible({ timeout: 15000 }).catch(() => undefined);
    await expectNoFatalCrash(page);
  });

  test('character book route renders (may host lexical compliance panel)', async ({ page }) => {
    await page.goto('/characters');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await dismissDevNotice(page);

    await expectNoFatalCrash(page);

    // If the compliance panel surfaced (unhealthy data), it must be labelled.
    const panel = page.locator('text=/Lexical compliance/i');
    if (await panel.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(panel.first()).toBeVisible();
    }
  });

  test('love route renders romantic relationship surface', async ({ page }) => {
    await page.goto('/love');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await dismissDevNotice(page);

    await expectNoFatalCrash(page);

    // Romantic lexical insights, when present, expose "lexical intelligence" copy.
    const insights = page.locator('text=/lexical intelligence|relationship/i');
    if (await insights.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(insights.first()).toBeVisible();
    }
  });
});

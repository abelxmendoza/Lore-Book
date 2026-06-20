import { test, expect } from '@playwright/test';

const INDEX = {
  entities: [
    {
      id: 'uuid-abel',
      name: 'Abel',
      type: 'character',
      aliases: [],
      mentionKeys: ['abel'],
      status: 'confirmed',
    },
  ],
};

const LOREBOOK_PARSE_OK = {
  operations: [
    {
      kind: 'suggest_add',
      domain: 'characters',
      name: 'Oscar Martinez',
      confidence: 0.9,
      gate: 'suggest',
    },
  ],
  redirects: [
    {
      kind: 'redirect',
      fromDomain: 'characters',
      toDomain: 'locations',
      name: 'Gothicumbia',
      reason: 'cross_book_guard',
      confidence: 0.85,
    },
  ],
  suppressed: [],
  warnings: [],
  lexicalSpanCount: 2,
};

test.describe('LoreBook parse composer chips (e2e)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/entities/certified-index', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(INDEX),
      });
    });

    await page.route('**/api/lexical/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spans: [], inferredAssociations: [], ambiguities: [] }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem(
        'lorekeeper_guest_state',
        JSON.stringify({
          isGuest: true,
          guestId: 'e2e-lorebook-parse',
          chatMessagesUsed: 0,
          chatLimit: 5,
          createdAt: Date.now(),
        })
      );
    });
  });

  test('shows LoreBook draft chip when parse API succeeds', async ({ page }) => {
    await page.route('**/api/conversation/lorebook-parse', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LOREBOOK_PARSE_OK),
      });
    });

    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.getByTestId('chat-composer').locator('textarea');
    await textarea.fill('Oscar Martinez went to Gothicumbia');

    await expect(page.getByTestId('composer-entity-chips')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('Oscar Martinez')).toBeVisible();
    await expect(page.getByTestId('composer-entity-chip-character-uuid-abel')).toHaveCount(0);
  });

  test('falls back to index-only chips when LoreBook parse API fails', async ({ page }) => {
    await page.route('**/api/conversation/lorebook-parse', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline' }) });
    });

    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.getByTestId('chat-composer').locator('textarea');
    await textarea.fill('Abel and I talked');

    await expect(page.getByTestId('composer-entity-chips')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('composer-entity-chip-character-uuid-abel')).toBeVisible();
    await expect(page.getByText('Oscar Martinez')).toHaveCount(0);
  });
});

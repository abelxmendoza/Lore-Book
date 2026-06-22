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
    {
      id: 'sug:character:kelly',
      name: 'Kelly',
      type: 'character',
      aliases: [],
      mentionKeys: ['kelly'],
      status: 'suggestion',
    },
  ],
};

test.describe('Composer entity chips while typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/entities/certified-index', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(INDEX),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
      window.localStorage.setItem(
        'lorekeeper_guest_state',
        JSON.stringify({
          isGuest: true,
          guestId: 'e2e-composer-chips',
          chatMessagesUsed: 0,
          chatLimit: 5,
          createdAt: Date.now(),
        })
      );
    });
  });

  test('shows confirmed and suggestion chips while typing, dismiss hides chip', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const composer = page.getByTestId('chat-composer');
    await expect(composer).toBeVisible({ timeout: 15_000 });

    const textarea = composer.locator('textarea');
    await textarea.fill('I talked to Abel and Kel');

    await expect(page.getByTestId('composer-entity-chips')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('composer-entity-chip-character-uuid-abel')).toBeVisible();
    await expect(page.getByTestId('composer-entity-chip-character-sug:character:kelly-confirm')).toBeVisible();

    await page.getByTestId('composer-entity-dismiss-character-uuid-abel').click();
    await expect(page.getByTestId('composer-entity-chip-character-uuid-abel')).toHaveCount(0);
    await expect(page.getByTestId('composer-entity-chip-character-sug:character:kelly-confirm')).toBeVisible();
  });

  test('clears chips when the draft is emptied', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.getByTestId('chat-composer').locator('textarea');
    await textarea.fill('Abel');
    await expect(page.getByTestId('composer-entity-chips')).toBeVisible({ timeout: 10_000 });

    await textarea.fill('');
    await expect(page.getByTestId('composer-entity-chips')).toHaveCount(0);
  });

  test('shows retry banner when certified index fails to load', async ({ page }) => {
    await page.route('**/api/entities/certified-index', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline' }) });
    });

    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('composer-index-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('composer-index-retry')).toBeVisible();
  });
});

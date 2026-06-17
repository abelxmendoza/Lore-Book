import { test, expect } from '@playwright/test';

const THREAD_ID = 'guest-thread-entities';
const THREAD_STORAGE_KEY = 'lorekeeper_chat_threads_guest';

const seed = [
  {
    id: THREAD_ID,
    title: 'Entity mention test',
    messages: [
      {
        id: 'guest-u-entities',
        role: 'user',
        content: 'I visited Tía Maria in San Diego.',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'guest-a-entities',
        role: 'assistant',
        content: 'That sounds like a meaningful visit.',
        timestamp: new Date().toISOString(),
        isStreaming: false,
        mentionedEntities: [
          { id: 'c1', name: 'Tía Maria', type: 'character' },
          { id: 'l1', name: 'San Diego', type: 'location' },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  },
];

test.describe('Chat entity mentions — guest UI', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(
      ([key, data, threadId]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        window.localStorage.setItem(key, JSON.stringify(data));
        window.localStorage.setItem('lorekeeper_chat_last_thread_guest', threadId);
      },
      [THREAD_STORAGE_KEY, seed, THREAD_ID] as const
    );
  });

  test('shows detected entity chips on assistant messages after reload', async ({ page }) => {
    await page.goto(`/chat/${THREAD_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('That sounds like a meaningful visit.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('detected:')).toBeVisible();
    await expect(page.getByText('Tía Maria').first()).toBeVisible();
    await expect(page.getByText('San Diego').first()).toBeVisible();
    await expect(page.getByText('building on:')).toBeVisible();
  });
});

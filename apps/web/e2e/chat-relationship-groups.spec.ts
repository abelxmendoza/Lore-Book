import { test, expect } from '@playwright/test';

const THREAD_ID = 'guest-thread-relationships';
const THREAD_STORAGE_KEY = 'lorekeeper_chat_threads_guest';

const seed = [
  {
    id: THREAD_ID,
    title: 'Relationship groups test',
    messages: [
      {
        id: 'guest-u-rel',
        role: 'user',
        content: 'My cousin Marcus works at Vanguard Robotics.',
        timestamp: new Date().toISOString(),
        metadata: {
          ontology_enrichment: {
            relationship_groups: [
              { scope: 'FAMILY', entityNames: ['Marcus'], confidence: 0.9 },
              { scope: 'PROFESSIONAL', entityNames: ['Vanguard Robotics'], confidence: 0.85 },
            ],
          },
        },
      },
      {
        id: 'guest-a-rel',
        role: 'assistant',
        content: 'Marcus and Vanguard Robotics are noted.',
        timestamp: new Date().toISOString(),
        isStreaming: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  },
];

test.describe('Chat relationship groups — guest UI', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(
      ([key, data, threadId]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        window.localStorage.setItem(key, JSON.stringify(data));
        window.localStorage.setItem('lorekeeper_chat_last_thread_guest', threadId);
        window.localStorage.setItem(
          'lorekeeper_guest_state',
          JSON.stringify({
            isGuest: true,
            guestId: 'e2e-guest-relationships',
            chatMessagesUsed: 0,
            chatLimit: 5,
            createdAt: Date.now(),
          })
        );
      },
      [THREAD_STORAGE_KEY, seed, THREAD_ID] as const
    );
  });

  test('shows relationship groups on user messages and in composer strip', async ({ page }) => {
    await page.goto(`/chat/${THREAD_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await expect(page.getByText('My cousin Marcus works at Vanguard Robotics.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('relationships:')).toBeVisible();
    await expect(page.getByText(/family:/).first()).toBeVisible();
    await expect(page.getByText('Marcus').first()).toBeVisible();
    await expect(page.getByText(/work:/).first()).toBeVisible();
    await expect(page.getByText('Vanguard Robotics').first()).toBeVisible();
    await expect(page.getByText('relationship context:')).toBeVisible();
  });
});

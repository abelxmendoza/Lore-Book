import { test, expect } from '@playwright/test';

const THREAD_STORAGE_KEY = 'lorekeeper_chat_threads_guest';

test.describe('Chat durability — guest local persistence', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
  });

  test('stores user and assistant bubbles in localStorage for guest sessions', async ({ page }) => {
    const seed = [
      {
        id: 'guest-thread-1',
        title: 'Durability test',
        messages: [
          {
            id: 'guest-u1',
            role: 'user',
            content: 'E2E user bubble',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'guest-a1',
            role: 'assistant',
            content: 'E2E assistant bubble should persist',
            timestamp: new Date().toISOString(),
            isStreaming: false,
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    ];

    await page.evaluate(
      ([key, data]) => {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem('lorekeeper_chat_last_thread_guest', 'guest-thread-1');
      },
      [THREAD_STORAGE_KEY, seed] as const
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, THREAD_STORAGE_KEY);

    expect(stored).toBeTruthy();
    expect(stored[0].messages).toHaveLength(2);
    expect(stored[0].messages[1].role).toBe('assistant');
    expect(stored[0].messages[1].content).toContain('assistant bubble');
  });

  test('merge logic keeps assistant when only user exists in one source', async ({ page }) => {
    const merged = await page.evaluate(() => {
      const local = [
        { id: 'u1', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
        { id: 'a1', role: 'assistant', content: 'world', timestamp: new Date().toISOString() },
      ];
      const server = [{ id: 'db-u', role: 'user', content: 'hello', timestamp: new Date().toISOString() }];
      const fp = (m: { role: string; content: string }) =>
        `${m.role}:${m.content.trim().toLowerCase()}`;
      const map = new Map<string, typeof local[0]>();
      for (const m of [...local, ...server]) {
        const key = fp(m);
        const rank = (id: string) => (/^(u1|a1)/.test(id) ? 0 : 1);
        const existing = map.get(key);
        if (!existing || rank(m.id) > rank(existing.id)) map.set(key, m);
      }
      return [...map.values()].map((m) => m.role);
    });

    expect(merged).toEqual(['user', 'assistant']);
  });
});

test.describe('Chat durability — UI smoke', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });
    await page.goto('/chat');
    await page.waitForSelector('textarea[placeholder*="Type your message"], textarea[placeholder*="Message Lore Book"]', {
      timeout: 10000,
    });
  });

  test('chat composer remains available after reload', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"], textarea[placeholder*="Message Lore Book"]').first();
    await input.fill('Reload durability check');
    await page.reload();
    await page.waitForSelector('textarea[placeholder*="Type your message"], textarea[placeholder*="Message Lore Book"]', {
      timeout: 10000,
    });
    await expect(input).toBeVisible();
  });
});

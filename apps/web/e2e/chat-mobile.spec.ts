import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.describe('Chat mobile layout', () => {

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('dev-notice-dismissed', 'true');
    });
  });

  test('composer and message area fit mobile viewport', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const composer = page.getByTestId('chat-composer');
    await expect(composer).toBeVisible({ timeout: 15_000 });

    const textarea = page.locator('textarea[placeholder*="Message Lore Book"]').first();
    await expect(textarea).toBeVisible();

    const box = await composer.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (box && viewport) {
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2);
    }
  });

  test('long drafts keep the Send button inside the visible mobile viewport', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('lorekeeper_guest_state', JSON.stringify({
        isGuest: true,
        guestId: 'mobile-layout-guest',
        chatMessagesUsed: 0,
        chatLimit: 5,
        createdAt: Date.now(),
      }));
      window.sessionStorage.setItem('lk_demo_runtime', 'true');
    });
    await page.goto('/demo');
    await page.waitForLoadState('domcontentloaded');
    const splash = page.getByTestId('welcome-splash');
    if (await splash.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await splash.click();
      await expect(splash).toBeHidden();
    }

    const composer = page.getByTestId('chat-composer');
    const textarea = composer.locator('textarea').first();
    const send = composer.getByRole('button', { name: 'Send message' }).last();

    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill(Array.from({ length: 80 }, (_, index) => `Story line ${index + 1}`).join('\n'));

    // The field must contain the draft instead of growing the composer beyond
    // the mobile viewport. Keyboard-height behavior is driven by
    // window.visualViewport in the component; Playwright's mobile emulation
    // keeps that viewport at the device height when setViewportSize is called.
    await expect(send).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    if (viewport) {
      await expect.poll(async () => {
        const box = await send.boundingBox();
        return box ? box.y + box.height : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(viewport.height + 2);
    }
  });

  test('guest thread shows user and assistant bubbles after reload', async ({ page, context }) => {
    const threadId = 'mobile-guest-thread';
    const seed = [
      {
        id: threadId,
        title: 'Mobile durability',
        messages: [
          {
            id: 'mu1',
            role: 'user',
            content: 'Mobile user message should persist',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'ma1',
            role: 'assistant',
            content: 'Mobile assistant response stays visible on small screens.',
            timestamp: new Date().toISOString(),
            isStreaming: false,
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    ];

    await context.addInitScript(
      ([key, data, id]) => {
        window.localStorage.setItem(key, JSON.stringify(data));
        window.localStorage.setItem('lorekeeper_chat_last_thread_guest', id);
      },
      ['lorekeeper_chat_threads_guest', seed, threadId] as const
    );

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Mobile user message should persist')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Mobile assistant response stays visible')).toBeVisible();
    await expect(page.getByTestId('chat-message-assistant').first()).toBeVisible();
  });
});

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
      // Model the viewport iOS/Android expose while the software keyboard is
      // open. The layout viewport remains 844px tall, but only the first 430px
      // are reachable above the keyboard.
      const listeners = new Map<string, Set<EventListener>>();
      const visualViewport = {
        height: 430,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
        addEventListener(type: string, listener: EventListener) {
          const bucket = listeners.get(type) ?? new Set<EventListener>();
          bucket.add(listener);
          listeners.set(type, bucket);
        },
        removeEventListener(type: string, listener: EventListener) {
          listeners.get(type)?.delete(listener);
        },
        dispatchEvent(event: Event) {
          for (const listener of listeners.get(event.type) ?? []) listener(event);
          return true;
        },
      };
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: visualViewport,
      });
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
    await textarea.fill(Array.from({ length: 500 }, (_, index) => `A very long story line ${index + 1} with enough detail to keep writing.`).join('\n'));

    // The field must contain the draft instead of growing the composer beyond
    // the mobile viewport. Keyboard-height behavior is driven by
    // window.visualViewport in the component; Playwright's mobile emulation
    // keeps that viewport at the device height when setViewportSize is called.
    await expect(send).toBeVisible();

    const visibleBottom = await page.evaluate(() => (
      (window.visualViewport?.offsetTop ?? 0) +
      (window.visualViewport?.height ?? window.innerHeight)
    ));
    await expect.poll(async () => {
      const box = await send.boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(visibleBottom + 2);
    // Trial click performs Playwright's real actionability and hit-target
    // checks without submitting the story.
    await send.click({ trial: true });
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

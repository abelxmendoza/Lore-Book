import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const THREAD_ID = 'auth-durability-thread';
const USER_ID = 'e2e-auth-durability-user';
const STORAGE_KEY = (() => {
  const candidates = [resolve(__dirname, '../../../.env'), resolve(__dirname, '../../../../.env')];
  for (const envPath of candidates) {
    try {
      const env = readFileSync(envPath, 'utf8');
      const match = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
      const url = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (url && !url.includes('your-project')) {
        const host = new URL(url).hostname.split('.')[0];
        return `sb-${host}-auth-token`;
      }
    } catch {
      // continue
    }
  }
  return 'sb-placeholder-auth-token';
})();

const sessionPayload = {
  access_token: 'e2e-durability-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'e2e-durability-refresh',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-durability@test.local',
    app_metadata: {},
    user_metadata: {},
  },
};

const messages = [
  {
    id: 'db-u-dur',
    role: 'user',
    content: 'Durability check user bubble',
    created_at: '2026-06-01T00:00:00Z',
    metadata: {},
  },
  {
    id: 'db-a-dur',
    role: 'assistant',
    content: 'Durability check assistant bubble survives authenticated reload.',
    created_at: '2026-06-01T00:00:01Z',
    metadata: { saved_from_stream: true },
  },
];

function mockApi(url: string, method: string | undefined) {
  if (url.includes('/api/user/terms-status')) {
    return { status: 200, body: { accepted: true, acceptedAt: new Date().toISOString(), version: '1.0' } };
  }
  if (url.includes('/thread-health/repair') && method === 'POST') {
    return { status: 200, body: { repaired: 0, report: {} } };
  }
  if (url.includes('/recover-orphans') && method === 'POST') {
    return { status: 200, body: { success: true, recovered: 0 } };
  }
  if (url.includes('/threads?')) {
    return {
      status: 200,
      body: {
        success: true,
        threads: [{ id: THREAD_ID, title: 'Durability', updated_at: '2026-06-01T00:00:02Z', metadata: {} }],
        total: 1,
        hasMore: false,
      },
    };
  }
  if (url.includes(`/threads/${THREAD_ID}/ensure-visible`)) {
    return { status: 200, body: { success: true, thread: { title: 'Durability', updatedAt: '2026-06-01T00:00:02Z' } } };
  }
  if (url.includes(`/threads/${THREAD_ID}/messages`)) {
    return { status: 200, body: { success: true, messages } };
  }
  if (url.includes(`/threads/${THREAD_ID}/summary`)) {
    return {
      status: 200,
      body: {
        success: true,
        summary: {
          short: 'Durability thread recap',
          medium: 'You asked about durability and got an assistant reply.',
          long: 'Full durability recap',
          version: 1,
          messageCount: 2,
          people: [],
          places: [],
          themes: [],
        },
        continuity: '2 messages in this thread.',
        recallText: 'Full durability recap',
      },
    };
  }
  return null;
}

test.describe('Chat durability — authenticated reload', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(
      ([storageKey, session]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        window.localStorage.setItem(storageKey, JSON.stringify(session));
      },
      [STORAGE_KEY, sessionPayload] as const
    );

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const mocked = mockApi(req.url(), req.method());
      if (mocked) {
        await route.fulfill({
          status: mocked.status,
          contentType: 'application/json',
          body: JSON.stringify(mocked.body),
        });
        return;
      }
      await route.continue();
    });
  });

  test('hydrates user and assistant bubbles plus thread summary after reload', async ({ page }) => {
    await page.goto(`/chat/${THREAD_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Durability check user bubble')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Durability check assistant bubble survives')).toBeVisible();
    await expect(page.getByTestId('thread-summary-bar')).toBeVisible();
    await expect(page.getByText(/Durability thread recap/)).toBeVisible();
  });
});

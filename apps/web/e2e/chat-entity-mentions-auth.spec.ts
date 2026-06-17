import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const THREAD_ID = 'auth-thread-entities';
const USER_ID = 'e2e-auth-user-entities';

const mentionedEntities = [
  { id: 'c1', name: 'Tía Maria', type: 'character' },
  { id: 'l1', name: 'San Diego', type: 'location' },
];

function supabaseStorageKey(): string {
  const candidates = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];
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
      // try next path
    }
  }
  return 'sb-placeholder-auth-token';
}

const STORAGE_KEY = supabaseStorageKey();

const sessionPayload = {
  access_token: 'e2e-fake-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'e2e-fake-refresh-token',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-entities@test.local',
    app_metadata: {},
    user_metadata: {},
  },
};

function mockApiResponse(url: string, method: string | undefined): { status: number; body: unknown } | null {
  if (url.includes('/api/diagnostics/thread-health/repair') && method === 'POST') {
    return { status: 200, body: { repaired: 0, report: {} } };
  }
  if (url.includes('/api/conversation/threads/recover-orphans') && method === 'POST') {
    return { status: 200, body: { success: true, recovered: 0 } };
  }
  if (url.includes('/api/conversation/threads?')) {
    return {
      status: 200,
      body: {
        success: true,
        threads: [
          {
            id: THREAD_ID,
            title: 'Entity mention reload',
            updated_at: '2026-06-01T00:00:02Z',
            metadata: {},
          },
        ],
        total: 1,
        hasMore: false,
        nextCursor: null,
      },
    };
  }
  if (url.includes(`/api/conversation/threads/${THREAD_ID}/ensure-visible`) && method === 'POST') {
    return {
      status: 200,
      body: {
        success: true,
        thread: { title: 'Entity mention reload', updatedAt: '2026-06-01T00:00:02Z' },
      },
    };
  }
  if (url.includes(`/api/conversation/threads/${THREAD_ID}/messages`)) {
    return {
      status: 200,
      body: {
        success: true,
        messages: [
          {
            id: 'db-u-entities',
            role: 'user',
            content: 'I visited Tía Maria in San Diego.',
            created_at: '2026-06-01T00:00:00Z',
            metadata: {},
          },
          {
            id: 'db-a-entities',
            role: 'assistant',
            content: 'That sounds like a meaningful visit.',
            created_at: '2026-06-01T00:00:01Z',
            metadata: {
              mentionedEntities,
              saved_from_stream: true,
              entity_backfill_at: '2026-06-01T00:00:01Z',
            },
          },
        ],
      },
    };
  }
  return null;
}

test.describe('Chat entity mentions — authenticated API reload', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(
      ([storageKey, session]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        window.localStorage.setItem(storageKey, JSON.stringify(session));
      },
      [STORAGE_KEY, sessionPayload] as const
    );

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const mocked = mockApiResponse(url, request.method());
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

  test('shows detected entity chips after authenticated hydrate reload', async ({ page }) => {
    await page.goto(`/chat/${THREAD_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('That sounds like a meaningful visit.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('detected:')).toBeVisible();
    await expect(page.getByText('Tía Maria').first()).toBeVisible();
    await expect(page.getByText('San Diego').first()).toBeVisible();
    await expect(page.getByText('building on:')).toBeVisible();
  });
});

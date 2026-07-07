import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// The certified-entity index only loads for a logged-in book (guests have no
// backend entities), so the composer-chip behavior is an authenticated scenario.
// supabase-js derives its storage key from VITE_SUPABASE_URL, which differs
// between the local dev env (apps/web/.env.local) and the CI build (root .env),
// so seed the fake session under every candidate key.
function supabaseStorageKeys(): string[] {
  const envFiles = [
    resolve(__dirname, '../.env.local'),
    resolve(__dirname, '../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  const keys = new Set<string>();
  for (const envPath of envFiles) {
    try {
      const env = readFileSync(envPath, 'utf8');
      const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (url && !url.includes('your-project')) {
        keys.add(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
      }
    } catch {
      // try next path
    }
  }
  // Always include the CI key: the CI production build bakes in
  // https://placeholder.supabase.co (see ci.yml web-production-build), so the
  // app looks for this key even when a local .env resolves differently.
  keys.add('sb-placeholder-auth-token');
  return [...keys];
}

const STORAGE_KEYS = supabaseStorageKeys();

const sessionPayload = {
  access_token: 'e2e-fake-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'e2e-fake-refresh-token',
  user: {
    id: 'e2e-composer-chips-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-composer@test.local',
    app_metadata: {},
    user_metadata: {},
  },
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

    // Authed app must not get stuck on the ToS gate.
    await page.route('**/api/user/terms-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString(), version: '1.0' }),
      });
    });

    await page.addInitScript(
      ([storageKeys, session]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        for (const key of storageKeys) {
          window.localStorage.setItem(key, JSON.stringify(session));
        }
      },
      [STORAGE_KEYS, sessionPayload] as const,
    );
  });

  test('shows confirmed and suggestion chips while typing, dismiss hides chip', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    const composer = page.getByTestId('chat-composer');
    await expect(composer).toBeVisible({ timeout: 15_000 });

    const textarea = composer.locator('textarea');
    // Full mentions: Abel resolves to the confirmed index entity, Kelly to the
    // suggestion entity. (A bare in-progress prefix like "Kel" surfaces as a draft
    // rather than the certified suggestion, which is separate behavior.)
    await textarea.fill('I talked to Abel and Kelly');

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

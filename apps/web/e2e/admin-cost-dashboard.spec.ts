import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

function supabaseStorageKey(): string {
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
      // try next
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
    id: 'e2e-admin-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-admin@test.local',
    app_metadata: { role: 'admin' },
    user_metadata: {},
  },
};

const COST_SUMMARY = {
  rangeDays: 30,
  since: '2026-05-23',
  totalUsd: 1.2345,
  totalCalls: 128,
  byOperation: [
    { operation: 'chat', usd: 0.9, calls: 80, pctOfTotal: 72.9 },
    { operation: 'ingestion', usd: 0.25, calls: 40, pctOfTotal: 20.3 },
    { operation: 'embedding', usd: 0.0845, calls: 8, pctOfTotal: 6.8 },
  ],
  byModel: [{ model: 'gpt-4o-mini', usd: 1.2345, calls: 128 }],
  byDay: [{ day: '2026-06-22', usd: 1.2345, calls: 128 }],
  budget: null,
  derived: { chatUsd: 0.9, avgUsdPerDay: 1.2345 },
};

const ADMIN_AUTHORITY = {
  role: 'admin',
  roleLabel: 'Admin',
  canAccessAdmin: true,
  canAccessDevConsole: true,
  isFounder: false,
};

/**
 * Navigate to /admin and skip the test if the seeded session isn't accepted.
 * The admin page is gated by server-validated auth + an admin authority, so a
 * faked localStorage session can't reach it in environments without a real
 * seeded admin. Where one IS seeded (e.g. CI with storageState), these run.
 */
async function gotoAdminOrSkip(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.waitForTimeout(2500);
  test.skip(
    !page.url().includes('/admin'),
    'Requires a seeded admin session (server-validated auth rejects the faked session).',
  );
}

test.describe('Admin AI Cost dashboard', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(
      ([storageKey, session]) => {
        window.localStorage.setItem('dev-notice-dismissed', 'true');
        window.localStorage.setItem(storageKey as string, JSON.stringify(session));
      },
      [STORAGE_KEY, sessionPayload] as const,
    );

    // Route all API calls: specific mocks first, sensible default last.
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      // Never intercept JS modules / documents that happen to match the glob —
      // returning JSON for a module script breaks the app shell.
      if (req.resourceType() !== 'fetch' && req.resourceType() !== 'xhr') {
        return route.fallback();
      }
      const url = req.url();
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (url.includes('/api/user/authority')) return json(ADMIN_AUTHORITY);
      if (url.includes('/api/admin/cost')) return json(COST_SUMMARY);
      if (url.includes('/api/user/terms-status')) {
        return json({ accepted: true, acceptedAt: new Date().toISOString(), version: '1.0' });
      }
      if (url.includes('/api/admin/metrics')) {
        return json({ totalUsers: 0, totalMemories: 0, newUsersLast7Days: 0, aiGenerationsToday: 0, errorLogsLast24h: 0 });
      }
      if (url.includes('/api/admin/users')) return json({ users: [] });
      if (url.includes('/api/admin/logs')) return json({ logs: [] });
      if (url.includes('/api/admin/ai-events')) return json({ events: [] });
      // Default: empty success so the page never hangs on an unmocked call.
      return json({});
    });
  });

  test('renders whole-app cost with operation attribution', async ({ page }) => {
    await gotoAdminOrSkip(page);

    // Open the AI Cost section from the sidebar.
    await page.getByText('AI Cost', { exact: true }).first().click();

    const panel = page.getByTestId('ai-cost-dashboard');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Headline total (USD) and the "where" attribution rows.
    await expect(panel).toContainText('$1.23');
    await expect(panel).toContainText('chat');
    await expect(panel).toContainText('ingestion');
    await expect(panel).toContainText('embedding');
    await expect(panel).toContainText('gpt-4o-mini');
  });

  test('shows the empty state when no cost is recorded', async ({ page }) => {
    await page.route('**/api/admin/cost**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rangeDays: 30,
          since: '2026-05-23',
          totalUsd: 0,
          totalCalls: 0,
          byOperation: [],
          byModel: [],
          byDay: [],
          budget: null,
          derived: { chatUsd: 0, avgUsdPerDay: 0 },
        }),
      }),
    );

    await gotoAdminOrSkip(page);
    await page.getByText("AI Cost", { exact: true }).first().click();

    const panel = page.getByTestId('ai-cost-dashboard');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText('No cost recorded yet');
  });
});

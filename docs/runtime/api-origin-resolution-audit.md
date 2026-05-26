# API Origin Resolution Audit
**Date:** 2026-05-26  
**Scope:** Frontend API URL resolution — env.ts → fetchJson → production routing  
**Triggered by:** Network inspector proof that POST /api/user/accept-terms hits Vercel (returns HTML) not Railway

---

## 1. Root Cause

`VITE_API_URL` was not set in Vercel's Environment Variables panel.  
At build time, `import.meta.env.VITE_API_URL` resolved to `undefined`.  
`env.ts` line 24 silently fell back to `''`.  
`fetchJson` prepended `''` to `/api/*` paths → relative URLs → Vercel intercepted all API calls → returned HTML.

**Production consequence:** Every authenticated POST/GET hit `https://lore-keeper-web.vercel.app/api/*` and received a Vercel 200 HTML response. `fetchJson` called `.json()` on HTML → `JSON.parse: unexpected character at line 1 column 1`.

---

## 2. URL Resolution Chain (before fix)

```
VITE_API_URL=undefined (Vercel build)
  → rawApiUrl = ''
  → useProxyInDev = false (isProduction=true)
  → API_URL = '' || '' = ''                  ← silent empty string
  → config.api.url = ''
  → fetchJson: url = '' + '/api/user/accept-terms' = '/api/user/accept-terms'
  → fetch('/api/user/accept-terms')          ← relative → Vercel
  → Vercel returns: 200 text/html            ← FAIL
```

---

## 3. Fixes Applied

### 3a. `apps/web/.env.production` (NEW — committed to repo)

```
VITE_API_URL=https://lore-book-production.up.railway.app
```

Vite loads `.env.production` during production builds. This file is NOT gitignored  
(only `.env.*.local` variants are excluded). Vercel's build process will pick this up  
from the repo without requiring dashboard configuration.

**Note:** If `VITE_API_URL` is also set in the Vercel dashboard, dashboard value wins  
(dashboard env vars override file env vars). Either is sufficient; having both is safe.

### 3b. `apps/web/src/config/env.ts` — `getApiBaseUrl()` function

Replaced the silent fallback expression with a named function that logs a hard  
`console.error` when `VITE_API_URL` is missing in a production build:

```ts
export function getApiBaseUrl(): string {
  if (useProxyInDev) return '';          // dev: Vite proxy
  if (rawApiUrl) return rawApiUrl;       // explicitly configured
  if (isProduction) {
    console.error(
      '[ROUTING] ❌ VITE_API_URL is not set in this production build.\n' +
      `  All /api/* calls will resolve to: ${window.location.origin} (Vercel — returns HTML)\n` +
      '  Fix: Vercel Dashboard → Project → Settings → Environment Variables:\n' +
      '       VITE_API_URL = https://lore-book-production.up.railway.app\n' +
      '  Then redeploy.'
    );
  }
  return '';
}
export const API_URL = getApiBaseUrl();
```

`config.api.url` continues to reference `API_URL` — no call-site changes required.

### 3c. `apps/web/src/services/environmentIntegrity.ts` — same-origin assertion

Removed the `useMockData === 'false'` gate that was preventing the warning from firing  
(default value is `'true'`, so the warning NEVER fired in production).

Two new production checks:

1. **Missing URL check** — when `VITE_API_URL` is not set, push an `error` (not warning):
   ```
   VITE_API_URL is not set. All API calls will hit <origin> (Vercel) instead of Railway.
   ```

2. **Same-origin assertion** — when `VITE_API_URL` IS set but resolves to the same origin as  
   the frontend (e.g. user accidentally set it to the Vercel URL):
   ```
   VITE_API_URL resolves to the frontend origin (https://lore-keeper-web.vercel.app).
   All API calls will hit Vercel and return HTML instead of JSON.
   ```

### 3d. `apps/web/src/lib/api.ts` — routing diagnostics in `fetchJson`

Added per-request diagnostic log at the start of every fetch:

```ts
const hasRoutingConcern = config.env.isProduction && !apiBaseUrl;
if (config.logging.logApiCalls || hasRoutingConcern) {
  const logFn = hasRoutingConcern ? console.error : console.log;
  logFn(
    `[API] baseUrl=${apiBaseUrl || '(empty→same-origin)'} requestUrl=${urlStr} ` +
    `environment=${import.meta.env.MODE} resolvedOrigin=${resolvedOrigin}`
  );
}
```

- In **development**: fires on every request (logApiCalls=true) via `console.log`
- In **production with missing VITE_API_URL**: fires on every request via `console.error`
- In **production with correct VITE_API_URL**: silent (no noise on happy path)

---

## 4. URL Resolution Chain (after fix)

```
apps/web/.env.production → VITE_API_URL=https://lore-book-production.up.railway.app
  → rawApiUrl = 'https://lore-book-production.up.railway.app'
  → useProxyInDev = false (isProduction=true)
  → getApiBaseUrl() returns rawApiUrl
  → API_URL = 'https://lore-book-production.up.railway.app'
  → config.api.url = 'https://lore-book-production.up.railway.app'
  → fetchJson: url = 'https://lore-book-production.up.railway.app' + '/api/user/accept-terms'
  → fetch('https://lore-book-production.up.railway.app/api/user/accept-terms')  ← Railway
  → Railway returns: 200 application/json  ← OK
```

---

## 5. Deployment Invariants (post-fix)

| Invariant | Mechanism | Status |
|-----------|-----------|--------|
| Production build always has `VITE_API_URL` | `.env.production` committed to repo | ✅ |
| Missing `VITE_API_URL` logs hard error at module load | `getApiBaseUrl()` console.error | ✅ |
| Missing `VITE_API_URL` logged at boot | `environmentIntegrity.ts` error (ungated) | ✅ |
| Same-origin misconfiguration detected | `environmentIntegrity.ts` same-origin assert | ✅ |
| Per-request routing diagnostics available | `fetchJson` diagnostic log | ✅ |
| HTML response before JSON.parse fails loud | `fetchJson` content-type guard | ✅ (prior fix) |

---

## 6. Remaining Known Debt

| Item | Risk | Priority |
|------|------|----------|
| 21 raw `fetch('/api/...')` calls in EXPERIMENTAL components | Bypass `fetchJson`; always relative; fail silently in prod | Low — non-CORE_RUNTIME paths |
| CSRF token flow verification | `fetchJson` does not auto-read/re-send `X-CSRF-Token`; POST to accept-terms may need manual verification | Medium |
| `terms_acceptance` table in prod Supabase | May not exist; POST /api/user/accept-terms returns 500 JSON with migration instructions | Medium |

---

## 7. Vercel Dashboard vs Repo File

Both mechanisms are valid. Priority order at Vercel build time:  
1. **Vercel Dashboard** environment variables (override repo files)  
2. **`.env.production`** in repo (read by Vite at build time)

With `.env.production` committed, a fresh Vercel deployment from the repo will work  
correctly even without dashboard configuration. The dashboard setting is a useful  
override/override mechanism for secrets that should not be in source control  
(API keys, auth tokens). `VITE_API_URL` is not a secret and belongs in the repo.

# CSRF + Auth Flow
**Date:** 2026-05-26  
**Scope:** Production security flow — Vercel frontend → Railway backend  
**Triggered by:** 403 CSRF token required on POST /api/user/accept-terms after routing was fixed

---

## 1. Architecture Context

```
Frontend: https://lore-keeper-web.vercel.app   (Vite/React, Vercel)
Backend:  https://lore-book-production.up.railway.app  (Express, Railway)
Auth:     Supabase JWT — Bearer token in Authorization header
```

These are **different origins**. This has two security consequences:
- Cookies with `sameSite: 'strict'` will NOT be sent on cross-origin requests
- CORS must explicitly allow `X-CSRF-Token` in `allowedHeaders` and `exposedHeaders`

Both are correctly configured: `credentials: true`, `allowedHeaders: ['X-CSRF-Token']`,
`exposedHeaders: ['X-CSRF-Token']` in `apps/server/src/index.ts`.

---

## 2. Authentication Flow

```
1. User signs in via Supabase (Google OAuth or email/password)
2. Supabase returns a JWT access token
3. supabase.auth.getSession() → data.session.access_token
4. fetchJson() reads this token and adds: Authorization: Bearer <jwt>
5. authMiddleware on apiRouter verifies the JWT via Supabase
6. req.user = { id, email, ... } populated for all protected routes
```

Auth is stateless (JWT Bearer). No session cookies. No CORS credential cookies needed for auth.

---

## 3. CSRF Protection Design

### Why CSRF for a JWT-auth API?

Even with JWT Bearer auth, CSRF tokens provide defense-in-depth:
- A malicious site could trigger cross-origin requests that the browser auto-sends
  (e.g. form submissions, image tags to mutation endpoints)
- The JWT is in Authorization header (safe — can't be set by cross-site forms)
  but belt-and-suspenders is correct for user-data-mutating endpoints

### Token Store (server-side)

```ts
// apps/server/src/middleware/csrf.ts
const tokenStore = new Map<string, { token: string; expiresAt: number }>();
// Key: req.user.id (for authenticated requests)
// Value: { token: 64-char hex, expiresAt: now + 1hr }
```

Tokens are in-memory. Railway restarts clear the store → users get 403 until they re-acquire.
This is acceptable: the re-acquisition flow is transparent (1 extra GET → retry works immediately).

### Middleware Chain (production only)

```
POST /api/user/accept-terms
  → schemaGuard
  → intrusionDetection
  → authMiddleware           ← populates req.user.id
  → csrfTokenMiddleware      ← generates token IF not in store; sets X-CSRF-Token in RESPONSE
  → validateRequestSize
  → csrfProtection           ← validates X-CSRF-Token HEADER in REQUEST → 403 if missing
  → validateCommonPatterns
  → rateLimitMiddleware
  → inputSanitizer
  → route handler
```

### The Chicken-and-Egg Problem (now fixed)

`csrfTokenMiddleware` only runs on POST/PUT/PATCH/DELETE — never on GET.
The first POST arrives with no token → `csrfTokenMiddleware` generates one (in the response)
→ `csrfProtection` immediately checks the request (no token yet) → 403.

**Fix:** `GET /api/security/csrf-token` endpoint that pre-populates the token store for
the authenticated user and returns the token in the response body.

---

## 4. Canonical CSRF Flow (post-fix)

```
App load
  → User authenticates (Supabase JWT obtained)
  → User navigates to a feature requiring a POST (e.g. Terms of Service)

Before first POST:
  → fetchJson detects: mutating method + user has JWT + no cached CSRF token
  → Calls acquireCsrfToken(bearerToken, apiBase)
  → GET /api/security/csrf-token
      Headers: Authorization: Bearer <jwt>
      Response: { ok: true, csrfToken: "abc123..." }
  → csrfTokenCache = "abc123..."

POST /api/user/accept-terms:
  → fetchJson calls addCsrfHeaders() → { X-CSRF-Token: "abc123..." }
  → csrfProtection: tokenStore.get(user.id) = { token: "abc123..." }
  → tokens match → request proceeds → 200 ✅

Subsequent POSTs:
  → csrfTokenCache still populated → no extra GET
  → Token valid for 1 hour
```

---

## 5. Token Expiry & Error Recovery

**Normal expiry (1hr):**
```
POST → 403 { error: "CSRF token expired" }
fetchJson detects CSRF error:
  → invalidateCsrfToken() — clears cache
  → acquireCsrfToken() — fetches new token from GET /api/security/csrf-token
  → throws: "Security validation failed. Please refresh and try again."
User retries the action → acquireCsrfToken() fires again (cache empty) → succeeds
```

**Railway restart (token store wiped):**
Same recovery path — 403 triggers re-acquisition on next attempt.

**User error message (before fix):**
```
"Failed to accept terms: CSRF token required"
```

**User error message (after fix):**
```
"Security validation failed. Please refresh the page and try again."
```
On refresh, `acquireCsrfToken()` is called fresh → succeeds immediately.

---

## 6. Implementation Files

| File | Change |
|------|--------|
| `apps/server/src/middleware/csrf.ts` | Added `createCsrfTokenForUser(userId)` export |
| `apps/server/src/routes/security.ts` | NEW — `GET /api/security/csrf-token` handler |
| `apps/server/src/routes/routeRegistry.ts` | Registered `/api/security` as CORE_RUNTIME |
| `apps/web/src/lib/security.ts` | Replaced broken meta-tag lookup with in-memory cache + `acquireCsrfToken` + `invalidateCsrfToken` |
| `apps/web/src/lib/api.ts` | Pre-acquires CSRF token before mutating requests; handles 403 CSRF errors |
| `apps/web/src/components/security/TermsOfServiceAgreement.tsx` | User-facing CSRF error message |

---

## 7. Cookie Behavior (Cross-Origin)

The CSRF middleware also sets a cookie:
```ts
res.cookie('csrf-token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 3600000
});
```

This cookie **does not work** for the cross-origin Vercel→Railway architecture:
- `sameSite: 'strict'` prevents the browser from sending it cross-origin
- `httpOnly: true` prevents JS from reading it for the header approach

The header-based flow (`X-CSRF-Token` in request header, token acquired via
`GET /api/security/csrf-token`) is the correct pattern for this split deployment.
The cookie is inert in production — no change needed, it does no harm.

---

## 8. Production Assumptions

| Assumption | Verified |
|------------|----------|
| CORS allows `X-CSRF-Token` header | ✅ `allowedHeaders` in index.ts |
| CORS exposes `X-CSRF-Token` header | ✅ `exposedHeaders` in index.ts |
| `credentials: true` on CORS | ✅ |
| JWT auth populates `req.user.id` before CSRF middleware | ✅ `authMiddleware` runs first |
| CSRF skipped in development | ✅ `isDevelopment()` guard in both middlewares |
| `GET /api/security/csrf-token` requires auth | ✅ `requireAuth` middleware |
| Token store keyed by `user.id` (not IP) | ✅ `sessionId = user?.id \|\| req.ip` |

---

## 9. Remaining Risks

1. **In-memory token store** — Railway restarts wipe all tokens. Users get 403 once
   post-restart, then the re-acquisition flow recovers silently on next attempt.
   For zero-disruption: migrate `tokenStore` to Redis or Supabase. Not urgent.

2. **`terms_acceptance` table** — If missing in production Supabase, the handler returns
   500 even after CSRF succeeds. Run `migrations/20250120_terms_acceptance.sql`.
   The ToS modal will loop until this migration is applied.

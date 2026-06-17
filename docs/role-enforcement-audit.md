# Role Enforcement & Billing Bypass Audit

**Date:** 2026-06-16  
**Scope:** Owner (`abelxmendoza@gmail.com`), Developer (`firefistabel@gmail.com`), Stripe billing bypass, subscription authority  
**Method:** Read-only code audit — no fixes implemented in this sprint

---

## Executive Summary

| Area | Verdict | Risk |
|------|---------|------|
| Server billing bypass (owner/admin/developer) | **Mostly consistent** | Medium |
| Single source of truth for roles | **Partial** — duplicates exist | Medium |
| UI role/billing display | **Inconsistent copy** vs product spec | Low |
| Backend enforcement | **Strong on billing mutations & limits** | Medium (metadata escalation) |
| Test coverage for privileged billing | **Weak** | High |

Backend billing bypass is implemented correctly on the **critical paths** (subscription mutations, entry/AI limits, privileged status response). The main risks are **duplicate role resolution** (server vs client env), **`user_metadata.role` trusted server-side**, and **missing integration tests** for privileged accounts.

---

## PART 1 — Role Source of Truth

### Canonical server authority

**Primary source:** `apps/server/src/lib/accountAuthority.ts`

| Concept | Location |
|---------|----------|
| Role enum | `PlatformRole`: `owner \| admin \| developer \| standard_user \| beta_user` |
| Privileged set | `PRIVILEGED_ROLES` = owner, admin, developer |
| Resolution | `resolveAccountAuthorityFromAuthUser()` — precedence: owner → admin → developer → beta_user → standard_user |
| Async lookup | `resolveAccountAuthority(userId)` via Supabase Admin `getUserById` |
| Billing flags | `canBeBilled`, `canCancelSubscription`, `canLoseAccess` = `!isPrivileged` |
| Bypass helpers | `isPrivilegedAccount()`, `isBillingExempt()` |

**Identity inputs (server env):** `apps/server/src/config.ts`

- `OWNER_USER_ID` / `FOUNDER_USER_ID`
- `OWNER_EMAIL` / `FOUNDER_EMAIL` (falls back to `ADMIN_EMAIL` if unset)
- `ADMIN_USER_ID`, `ADMIN_EMAIL`
- `DEVELOPER_EMAIL`

**Metadata inputs:** `app_metadata.role` **and** `user_metadata.role` (both accepted — see security risk in Part 4)

### Database role table

**None.** Roles are not stored in Postgres. Stripe tier lives in `public.subscriptions` (`supabase/migrations/20250115000027_subscriptions.sql`). Admin user list merges Supabase auth + Stripe row in `apps/server/src/routes/admin.ts`.

### Server middleware

| File | Role | Uses `accountAuthority`? |
|------|------|--------------------------|
| `apps/server/src/middleware/rbac.ts` | `requireRole`, `requireAdmin`, `requireDevAccess` | Yes |
| `apps/server/src/middleware/subscription.ts` | Entry/AI limits, `requirePremium`, `checkSubscription` | Yes (`isPrivilegedAccount`) |
| `apps/server/src/middleware/auth.ts` | JWT validation | No (identity only) |
| `apps/server/src/lib/founderGuard.ts` | Blocks synthetic data on founder account | Separate from RBAC |

### Client (duplicate) authority

| File | Purpose | Authoritative? |
|------|---------|----------------|
| `apps/web/src/middleware/roleGuard.ts` | `resolveClientRole`, badges, admin/dev console routing | **No** — mirrors server via `VITE_*` env |
| `apps/web/src/lib/accountAuthority.ts` | Types + `isPrivilegedAuthority()` | **No** — consumes API `authority` block |

### Duplicates / legacy (should not be used for enforcement)

| File | Issue |
|------|-------|
| `apps/server/src/middleware/roleGuard.ts` | Legacy sync helpers; **no `owner` role**; **not imported** by any route |
| `apps/server/src/middleware/featureFlags.ts` | Reads `user.role` / metadata directly; does not use `accountAuthority` |
| `apps/web/src/middleware/roleGuard.ts` | Full duplicate resolution; must stay in sync with Railway env vars |

### Single source of truth verdict

| Layer | Source | Drift risk |
|-------|--------|------------|
| Server RBAC + billing | `accountAuthority.ts` | Low if all paths use it |
| Server admin API | `rbac.ts` → `accountAuthority` | Low in production |
| Client badges/routing | `roleGuard.ts` + `VITE_*` | **High** if Vercel env ≠ Railway |
| Client privileged billing UI | `GET /api/subscription/status` → `authority` | **Low** (correct pattern) |

### Notable inconsistencies

1. **`OWNER_EMAIL` fallback to `ADMIN_EMAIL`** (server + client) — admin email can be treated as owner if owner env unset.
2. **`beta_user`** — resolved but **not privileged**; billed like standard user.
3. **Legacy server `roleGuard.ts`** still has tests but is dead code for HTTP.

---

## PART 2 — Billing Enforcement Audit

### Central bypass

Privileged accounts bypass limits via `isPrivilegedAccount()` / `isBillingExempt()` from `accountAuthority.ts`.

### Middleware wiring

| Middleware | Wired to routes? | Privileged bypass |
|------------|------------------|-------------------|
| `checkEntryLimit` | `POST /api/entries` | Yes |
| `checkAiRequestLimit` | `POST /api/chat`, `POST /api/chat/stream` | Yes |
| `checkSubscription` | **Not wired** | Would bypass if wired |
| `requirePremium` | **Not wired** | Would bypass if wired |
| `attachUsageData` | **Not wired** | N/A |

### Subscription API (`apps/server/src/routes/subscription.ts`)

| Endpoint | Auth | Owner / Admin / Developer | Standard user |
|----------|------|---------------------------|---------------|
| `GET /status` | Required | Synthetic premium + `authority.isPrivileged` | Stripe + usage |
| `GET /usage` | Required | Unlimited via privilege path in `usageTracking` | Capped |
| `POST /create` | Required | **400 `billing_not_required`** | Stripe checkout |
| `POST /cancel` | Required | **400 `billing_not_required`** | Cancel at period end |
| `POST /reactivate` | Required | **400 `billing_not_required`** | Reactivate |
| `GET /billing-portal` | Required | **400 `billing_not_required`** | Stripe portal |
| `POST /webhook` | Signature only | Syncs DB; access still governed by authority | Same |

### Usage limits (`apps/server/src/services/usageTracking.ts`)

- Premium = `privileged OR subscription.planType === 'premium'`
- Trial = non-privileged only
- Limits = `Infinity` when premium or trial
- **`canMakeAiRequest` fails open on error** — returns `{ allowed: true }` (billing bypass on DB outage)

### Role matrix (expected vs actual)

| Role | Premium access | Billed | Stripe checkout | Cancel/billing portal | Entry/AI caps |
|------|----------------|--------|-----------------|----------------------|---------------|
| **OWNER** | Always | No | Blocked (400) | Blocked (400) | Unlimited |
| **ADMIN** | Always | No | Blocked | Blocked | Unlimited |
| **DEVELOPER** | Always | No | Blocked | Blocked | Unlimited |
| **beta_user** | Stripe/free only | Yes | Allowed | Allowed | Free/trial limits |
| **standard_user** | Stripe/trial/free | Yes | Allowed | Allowed | 50 entries / 100 AI (defaults) |
| **GUEST** | N/A | N/A | 401 (no JWT) | 401 | 401 on API |

### Inconsistencies found

1. **`requirePremium` / `checkSubscription` unwired** — no route-level premium gate beyond entry/AI counters.
2. **Marketing copy vs backend** — Free plan UI claims “Unlimited messages” (`SubscriptionManagement.tsx`); backend enforces AI request caps on `/api/chat`.
3. **Admin finance cancel** (`admin.ts`) — can cancel Stripe subscription by ID without checking target user's `isBillingExempt` (access unaffected; Stripe row may diverge).
4. **Stripe webhooks** — no privileged guard on sync (harmless for access; admin UI may show misleading Stripe status for owner/dev).
5. **`resolveAccountAuthority` fail-soft** — Supabase errors → `standard_user` (not fail-closed).

---

## PART 3 — UI Consistency Audit

### Expected vs actual copy

| Surface | Spec (this sprint) | Actual implementation | Match? |
|---------|-------------------|----------------------|--------|
| Owner Account Center | “Founder Account” + “Premium Access Included” | Header: **“Owner”** badge + subline **“Founder Account · Personal Production Data”**; Subscription tab: **“Owner”** + **“Full Platform Access — platform controls enabled”** | **Partial** |
| Developer Account Center | “Developer Account” + “Premium Access Included” | Header: **“Developer”** badge; Subscription tab: **“Developer Access”** + **“Premium Included — development privilege”** | **Partial** |
| Normal user | Subscription / Trial / Upgrade | Plan comparison, Stripe checkout, usage bars | **Yes** |

### Surface-by-surface

| Surface | Privileged handling | Notes |
|---------|---------------------|-------|
| `AccountCenter.tsx` | Client `resolveClientRole` badges; founder subline | Badges not from API; can drift from server |
| `SubscriptionManagement.tsx` | `PrivilegedAccessPanel` when `authority.isPrivileged` | Hides upgrade/cancel/billing; correct |
| `CheckoutFlow.tsx` | Blocks guests; skips Stripe for privileged | Server also returns 400 |
| `upgrade.tsx` | Redirects unauthenticated to `/login` before checkout | Public pricing page |
| `SubscriptionStatus.tsx` | No privileged-specific handling | May show billing CTAs if used outside Account Center |
| `PricingPage.tsx` | Ignores privileged state | Legacy component |
| `admin/index.tsx` | Client `canAccessAdmin` gate | API `requireAdmin` is real enforcement |
| `SubscriptionStatusBadge.tsx` (admin) | Stripe status only | No “privileged” badge — owner/dev may show “Free” |

---

## PART 4 — Security Audit

### Backend enforced (good)

- All `/api/*` routes pass global `authMiddleware` (`apps/server/src/index.ts`)
- Billing mutations use `isBillingExempt` on server
- Entry/AI limits enforced server-side with privilege bypass
- Admin routes: `requireAuth` + `requireAdmin`
- Webhook: signature verification

### Gaps and bypass paths

| Risk | Severity | Detail |
|------|----------|--------|
| **`user_metadata.role` trusted server-side** | **High** | `accountAuthority.ts:79` — users who can update their own metadata may self-escalate to admin/developer/owner if Supabase allows it. **Use `app_metadata` + env only.** |
| **`requireAdmin` dev bypass** | **High** if misconfigured | `rbac.ts:64-66` — all users pass admin middleware when `API_ENV=dev` or `development` |
| **`canMakeAiRequest` fail-open** | Medium | DB errors → unlimited AI |
| **`requirePremium` unwired** | Medium | Premium-only features lack route gate |
| **Client-only admin redirect** | Low | `/admin` visible in bundle; API returns 403 in production |
| **Legacy server `roleGuard.ts`** | Low | Dead code; maintenance hazard |
| **Env email fallbacks** | Low | Owner ← admin email widening |

### Frontend-only (not security boundaries)

- `canAccessAdmin`, `canAccessDevConsole`, Sidebar admin link, upgrade CTAs, Account Center badges

---

## PART 5 — Test Coverage Matrix

Legend: ✅ tested · ❌ missing · ⚠️ mocked as non-privileged only

### Billing endpoints × role

| Role | GET `/status` | GET `/usage` | POST `/create` | POST `/cancel` | POST `/reactivate` | GET `/billing-portal` | Entry limit | AI limit |
|------|---------------|--------------|----------------|----------------|--------------------|-----------------------|-------------|----------|
| **OWNER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ADMIN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **DEVELOPER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **USER (free)** | ⚠️ partial | ✅ | ⚠️ partial | ❌ | ❌ | ❌ | ⚠️ | ⚠️ |
| **USER (premium/trial)** | ⚠️ partial | ✅ | ⚠️ partial | ❌ | ❌ | ❌ | ⚠️ | ⚠️ |
| **GUEST** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Existing test files

| File | Coverage |
|------|----------|
| `apps/server/tests/lib/accountAuthority.test.ts` | Unit: owner/admin/developer/standard resolution, `canBeBilled` |
| `apps/server/tests/middleware/rbac.test.ts` | `requireRole`, dev admin bypass |
| `apps/server/tests/middleware/subscription.test.ts` | Limit middleware with **`isPrivilegedAccount` always false** |
| `apps/server/tests/routes/subscription.test.ts` | Status/usage/create/webhook; authority **mocked standard_user** |
| `apps/server/tests/middleware/roleGuard.test.ts` | **Legacy** server roleGuard (not production path) |
| `apps/web/src/middleware/roleGuard.test.ts` | Client `isAdmin` metadata only |

### Critical missing tests

1. `billing_not_required` (400) on create/cancel/reactivate/billing-portal for owner/admin/developer
2. `GET /status` returns `authority.isPrivileged: true` + synthetic premium for privileged roles
3. `isPrivilegedAccount` bypass in `checkEntryLimit` / `checkAiRequestLimit` (not mocked false)
4. `usageTracking` unlimited path for privileged users
5. `requireAdmin` rejects `standard_user` when `apiEnv=production`
6. **`user_metadata.role` escalation regression test**
7. Web: `CheckoutFlow` / `SubscriptionManagement` privileged UI
8. `beta_user` behavior end-to-end
9. Cancel, reactivate, billing-portal route tests (standard user path)

---

## PART 6 — Report Summary

### Current state

- **Server billing bypass works** on subscription mutations, status synthesis, and entry/AI middleware for owner/admin/developer.
- **Single server authority** exists in `accountAuthority.ts` but is **duplicated on the client** and partially duplicated in legacy/dead code.
- **UI shows privileged state** via API `authority` in Subscription tab; header badges use client env resolution.
- **Copy does not exactly match** the “Founder Account / Premium Access Included” product spec.

### Broken / inconsistent state

| Issue | Impact |
|-------|--------|
| UI copy mismatch (Owner vs Founder Account) | User confusion, not security |
| Client badges can disagree with API if `VITE_*` env stale | Wrong badge in Account Center header |
| Admin subscriber list shows Stripe-only status | Owner/dev may appear “Free” in admin |
| `user_metadata.role` server trust | Potential privilege escalation |
| No privileged integration tests | Regressions undetected |
| `requirePremium` unwired | Future premium features unprotected |

### Risk levels

| Item | Level |
|------|-------|
| Billing bypass for owner/developer on API | **Low** (implemented) |
| Privilege escalation via metadata | **High** (unverified in prod Supabase config) |
| Test gap for privileged billing | **High** |
| UI/env drift | **Medium** |
| Fail-open AI limits on DB error | **Medium** |
| Dead/unwired middleware | **Low–Medium** |

### Recommended fixes (not implemented)

1. **P0:** Stop trusting `user_metadata.role` for server privilege; use `app_metadata` + env only.
2. **P0:** Add integration tests for privileged billing bypass on all `/api/subscription/*` mutations.
3. **P1:** Align Account Center copy to product spec OR update spec to match implemented copy.
4. **P1:** Fetch role badges from `GET /api/subscription/status` `authority` instead of client-only resolution.
5. **P1:** Show `privileged` / `authority.role` in admin subscription views.
6. **P2:** Wire `requirePremium` to premium-only routes or remove dead middleware.
7. **P2:** Remove or quarantine legacy `apps/server/src/middleware/roleGuard.ts`.
8. **P2:** Make `canMakeAiRequest` fail-closed with logging.
9. **P2:** Tighten `requireAdmin` bypass to explicit local dev only.

### Files affected (primary)

| File | Role |
|------|------|
| `apps/server/src/lib/accountAuthority.ts` | Canonical server authority |
| `apps/server/src/routes/subscription.ts` | Billing API + bypass |
| `apps/server/src/middleware/subscription.ts` | Limit middleware |
| `apps/server/src/services/usageTracking.ts` | Usage + privilege |
| `apps/server/src/middleware/rbac.ts` | Admin/dev gates |
| `apps/web/src/middleware/roleGuard.ts` | Client duplicate |
| `apps/web/src/components/subscription/SubscriptionManagement.tsx` | Privileged UI |
| `apps/web/src/components/subscription/CheckoutFlow.tsx` | Checkout gate |
| `apps/web/src/routes/AccountCenter.tsx` | Header badges |
| `apps/server/tests/routes/subscription.test.ts` | Tests (gaps) |

---

**Related docs:** `docs/role-authority-model.md`, `docs/subscription-authority-audit.md`, `docs/founder-data-isolation.md`

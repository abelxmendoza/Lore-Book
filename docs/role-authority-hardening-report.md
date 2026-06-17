# Role Authority Hardening Report

**Date:** 2026-06-16  
**Sprint:** Role Authority Hardening  
**Success criteria:** No authorization decision depends on `user_metadata.role`; server authority is single source of truth; billing bypass fully tested.

---

## Summary

| Criterion | Status |
|-----------|--------|
| Eliminate `user_metadata.role` authorization | **Done** |
| Single server source of truth | **Done** — `accountAuthority.ts` |
| Frontend displays, never grants | **Done** — `GET /api/user/authority` |
| Privileged billing tests | **Done** — 20+ new matrix tests |
| Role escalation paths removed | **Done** (server-side) |

---

## Files Changed

### Server — canonical authority

| File | Change |
|------|--------|
| `apps/server/src/lib/accountAuthority.ts` | Removed `user_metadata.role`; added `serializeAccountAuthority`, `toPublicRole`, `canAccessAdminConsole`, exported `AuthUserLike` |
| `apps/server/src/routes/user.ts` | Added `GET /api/user/authority` |
| `apps/server/src/middleware/featureFlags.ts` | Delegates to `accountAuthority` |
| `apps/server/src/middleware/roleGuard.ts` | Delegates to `accountAuthority`; deprecated for HTTP |

### Web — server-driven display

| File | Change |
|------|--------|
| `apps/web/src/hooks/useAccountAuthority.ts` | **New** — fetches canonical authority |
| `apps/web/src/lib/accountAuthority.ts` | Public types + display helpers |
| `apps/web/src/middleware/roleGuard.ts` | Removed env/metadata resolution; server-authority helpers only |
| `apps/web/src/routes/AccountCenter.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/components/Sidebar.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/pages/admin/index.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/components/admin/AdminConsole.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/pages/dev-console/index.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/components/dev/DevConsole.tsx` | Uses `useAccountAuthority()` |
| `apps/web/src/components/subscription/SubscriptionManagement.tsx` | Owner/dev copy: “Founder Account” / “Premium Access Included” |

### Tests

| File | Change |
|------|--------|
| `apps/server/tests/lib/accountAuthority.test.ts` | Escalation regression tests |
| `apps/server/tests/routes/subscriptionAuthority.test.ts` | **New** — full billing role matrix |
| `apps/server/tests/middleware/rbac.test.ts` | `user_metadata` admin rejected; `app_metadata` used |
| `apps/server/tests/middleware/featureFlags.test.ts` | `user_metadata` developer ignored |
| `apps/server/tests/middleware/roleGuard.test.ts` | Hardened legacy helper tests |
| `apps/web/src/middleware/roleGuard.test.ts` | Rewritten for server authority helpers |
| `apps/web/src/components/Sidebar.test.tsx` | Mock `useAccountAuthority` |

### Documentation

| File | Purpose |
|------|---------|
| `docs/role-authority-map.md` | Full role read map |
| `docs/role-authority-hardening-report.md` | This report |

---

## Security Risks Removed

| Risk | Before | After |
|------|--------|-------|
| **Privilege escalation via `user_metadata.role`** | Server accepted user-writable metadata for owner/admin/developer | **Eliminated** — only env + `app_metadata.role` |
| **Client env role spoofing** | `VITE_OWNER_EMAIL` etc. drove UI admin badges | **Eliminated** — UI reads `/api/user/authority` |
| **Duplicate role resolution drift** | Server and client could disagree | **Reduced** — one server resolver, one API for client |
| **Untested privileged billing bypass** | All subscription tests mocked `isPrivileged: false` | **Fixed** — matrix tests for owner/admin/developer/user/guest |

---

## Tests Added

### `subscriptionAuthority.test.ts` (20 tests)

- **GUEST:** 401 on `/status`, `/create`
- **OWNER / ADMIN / DEVELOPER:** privileged `/status`, `billing_not_required` on create/cancel/reactivate/billing-portal
- **USER:** free status, Stripe create flow, cancel requires subscription

### `accountAuthority.test.ts` (new cases)

- `user_metadata.role: owner` → `standard_user`
- `user_metadata.role: developer` → `standard_user`
- `app_metadata.role: admin` → `admin`
- `serializeAccountAuthority` public role + access flags

### `rbac.test.ts`

- `user_metadata admin` → 403 Forbidden

---

## Phase 5 — Account Verification (code-level)

| Account | Full platform access | Billing bypass | Admin console | Dev console | Standard billing |
|---------|---------------------|----------------|---------------|-------------|------------------|
| **Owner** (`OWNER_EMAIL` env) | ✅ `isPrivileged` | ✅ `isBillingExempt` | ✅ `canAccessAdmin` | ✅ | N/A |
| **Developer** (`DEVELOPER_EMAIL`) | ✅ | ✅ | ✅ | ✅ | N/A |
| **Admin** (`ADMIN_EMAIL` / `app_metadata`) | ✅ | ✅ | ✅ | ✅ | N/A |
| **User** | ❌ | ❌ | ❌ | ❌ | ✅ Stripe flow |

**Manual production verification** still required after deploy — see `docs/post-deploy-verification.md`.

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `requireAdmin` dev bypass when `API_ENV=dev` | Medium | Any user passes admin middleware in misconfigured staging |
| `canMakeAiRequest` fail-open on DB error | Medium | Unchanged — returns `allowed: true` on error |
| `resolveAccountAuthority` fail-soft to `standard_user` | Low | Supabase outage demotes privileged users instead of denying |
| `requirePremium` / `checkSubscription` still unwired | Low | Entry/AI limits only |
| Admin UI subscription badge (Stripe-only) | Low | Privileged users may show “Free” in admin table |
| `app_metadata.role` writable via service role only | Low | Ensure Supabase RLS blocks user writes to `app_metadata` |

---

## Deploy Checklist

1. Deploy **Railway** (server) — authority endpoint + hardened resolver
2. Deploy **Vercel** (web) — `useAccountAuthority` + UI updates
3. Confirm Railway env: `OWNER_EMAIL`, `DEVELOPER_EMAIL`, `ADMIN_EMAIL`
4. Remove reliance on `VITE_OWNER_EMAIL` / `VITE_DEVELOPER_EMAIL` for authorization (optional to keep for non-auth display — no longer used)
5. Run manual owner/developer login verification on production

---

## API Reference

```http
GET /api/user/authority
Authorization: Bearer <supabase_jwt>
```

**Response (owner example):**

```json
{
  "role": "owner",
  "roleLabel": "Owner",
  "isFounderAccount": true,
  "isPrivileged": true,
  "privilegeSource": "platform_authority",
  "effectivePlanType": "premium",
  "canBeBilled": false,
  "canCancelSubscription": false,
  "canLoseAccess": false,
  "canAccessAdmin": true,
  "canAccessDevConsole": true
}
```

---

**Related:** `docs/role-authority-map.md`, `docs/role-enforcement-audit.md`

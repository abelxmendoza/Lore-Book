# Role Authority Map

**Last updated:** 2026-06-16 (post-hardening sprint)  
**Canonical server module:** `apps/server/src/lib/accountAuthority.ts`  
**Canonical client API:** `GET /api/user/authority` → `useAccountAuthority()`

---

## Role Model

| Internal role | Public API role | Privileged | Billing exempt |
|---------------|-----------------|------------|----------------|
| `owner` | `owner` | Yes | Yes |
| `admin` | `admin` | Yes | Yes |
| `developer` | `developer` | Yes | Yes |
| `standard_user` | `user` | No | No |
| `beta_user` | `beta_user` | No | No |

---

## Authorization Inputs (server only)

| Source | Authoritative? | Used for |
|--------|----------------|----------|
| `OWNER_USER_ID` / `FOUNDER_USER_ID` env | **Yes** | Owner detection |
| `OWNER_EMAIL` / `FOUNDER_EMAIL` env | **Yes** | Owner detection |
| `ADMIN_USER_ID` env | **Yes** | Admin detection |
| `ADMIN_EMAIL` env | **Yes** | Admin detection |
| `DEVELOPER_EMAIL` env | **Yes** | Developer detection |
| `app_metadata.role` (Supabase Admin API) | **Yes** | Server-set role claims |
| `user_metadata.role` | **No** | Informational only — **never grants privilege** |
| `VITE_*` env vars (web) | **No** | Removed from authorization — display uses API |
| Client JWT parsing | **No** | Session only; role from `/api/user/authority` |

**Resolution precedence:** env identity (owner → admin → developer) → `app_metadata.role` → `standard_user`

---

## Server Role Reads

| File | Function | Authority source |
|------|----------|------------------|
| `apps/server/src/lib/accountAuthority.ts` | `resolveAccountAuthorityFromAuthUser` | **Canonical** — env + `app_metadata` only |
| `apps/server/src/lib/accountAuthority.ts` | `resolveAccountAuthority` | Supabase Admin `getUserById` → canonical resolver |
| `apps/server/src/middleware/rbac.ts` | `requireRole`, `requireAdmin`, `requireDevAccess` | → `resolveAccountAuthority` |
| `apps/server/src/middleware/subscription.ts` | `checkEntryLimit`, `checkAiRequestLimit`, etc. | → `isPrivilegedAccount` |
| `apps/server/src/routes/subscription.ts` | All billing routes | → `resolveAccountAuthority` / `isBillingExempt` |
| `apps/server/src/routes/user.ts` | `GET /authority` | → `serializeAccountAuthority` |
| `apps/server/src/routes/admin.ts` | User list | → `resolveAccountAuthorityFromAuthUser` |
| `apps/server/src/middleware/featureFlags.ts` | `getActiveFlags` | → `resolveAccountAuthorityFromAuthUser` |
| `apps/server/src/middleware/roleGuard.ts` | Legacy sync helpers | → `resolveAccountAuthorityFromAuthUser` (deprecated) |
| `apps/server/src/services/usageTracking.ts` | Limits | → `isPrivilegedAccount` |
| `apps/server/src/lib/founderGuard.ts` | Synthetic data block | Env owner id/email only (not RBAC) |

---

## Frontend Role Reads (display / routing hints only)

| File | Pattern | Authoritative? |
|------|---------|----------------|
| `apps/web/src/hooks/useAccountAuthority.ts` | Fetches `GET /api/user/authority` | **Yes (display)** |
| `apps/web/src/middleware/roleGuard.ts` | Helpers on `ServerAccountAuthority` | Display only — no env/metadata resolution |
| `apps/web/src/routes/AccountCenter.tsx` | `useAccountAuthority()` | Server-driven badges |
| `apps/web/src/components/Sidebar.tsx` | `canAccessAdmin(authority)` | Server-driven admin link |
| `apps/web/src/pages/admin/index.tsx` | `canAccessAdmin(authority)` | Redirect if false; API enforces |
| `apps/web/src/components/subscription/SubscriptionManagement.tsx` | `subscription.authority` from API | Server-driven billing UI |
| `apps/web/src/components/subscription/CheckoutFlow.tsx` | `isPrivilegedAuthority(subscription.authority)` | Server-driven checkout gate |

**Removed:** `resolveClientRole`, `VITE_OWNER_EMAIL` / `VITE_DEVELOPER_EMAIL` client resolution, `user_metadata.role` client reads.

---

## Billing Enforcement Map

| Endpoint | Owner/Admin/Dev | User | Guest |
|----------|-----------------|------|-------|
| `GET /api/subscription/status` | Synthetic premium + `authority` | Stripe + usage | 401 |
| `POST /api/subscription/create` | 400 `billing_not_required` | Stripe flow | 401 |
| `POST /api/subscription/cancel` | 400 `billing_not_required` | Cancel | 401 |
| `POST /api/subscription/reactivate` | 400 `billing_not_required` | Reactivate | 401 |
| `GET /api/subscription/billing-portal` | 400 `billing_not_required` | Portal URL | 401 |
| `POST /api/entries` | Unlimited (`checkEntryLimit`) | Capped | 401 |
| `POST /api/chat` | Unlimited (`checkAiRequestLimit`) | Capped | 401 |

---

## Duplicates Eliminated

| Before | After |
|--------|-------|
| Client `VITE_*` + metadata role resolution | `GET /api/user/authority` |
| Server `user_metadata.role` in `accountAuthority` | Ignored |
| `featureFlags.ts` reading `user_metadata.role` | → `accountAuthority` |
| Legacy server `roleGuard.ts` metadata reads | → `accountAuthority` |

---

## Test Coverage (post-hardening)

| Suite | Covers |
|-------|--------|
| `tests/lib/accountAuthority.test.ts` | Escalation blocked, app_metadata, env identity, serialization |
| `tests/routes/subscriptionAuthority.test.ts` | OWNER/ADMIN/DEVELOPER/USER/GUEST billing matrix |
| `tests/middleware/rbac.test.ts` | `user_metadata` admin rejected |
| `tests/middleware/featureFlags.test.ts` | `user_metadata` developer ignored |
| `tests/middleware/roleGuard.test.ts` | Legacy helpers hardened |
| `apps/web/src/middleware/roleGuard.test.ts` | Server authority display helpers |

---

## Related Docs

- `docs/role-authority-model.md`
- `docs/role-enforcement-audit.md`
- `docs/role-authority-hardening-report.md`

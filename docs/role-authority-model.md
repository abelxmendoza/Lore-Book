# Role Authority Model

**Generated:** Phase 9 + Launch Readiness Sprint

## Canonical role hierarchy

```
Owner
  ↓
Admin
  ↓
Developer
  ↓
Premium (Stripe)
  ↓
Free
```

## Platform roles

| Role | Source | Premium | Billed | Can lose access |
|------|--------|---------|--------|-----------------|
| **Owner** | `OWNER_EMAIL` / `OWNER_USER_ID` / `app_metadata.role=owner` | Always | Never | Never |
| **Admin** | `ADMIN_EMAIL` / `ADMIN_USER_ID` / `app_metadata.role=admin` | Always | Never | Never |
| **Developer** | `DEVELOPER_EMAIL` / `app_metadata.role=developer` | Always | Never | Never |
| **Premium** | Stripe subscription (`subscriptions` table) | While active | Yes | On cancel/lapse |
| **Free** | Default signup trigger | No | No | N/A |

## Implementation

- **Server:** `apps/server/src/lib/accountAuthority.ts`
- **RBAC middleware:** `apps/server/src/middleware/rbac.ts`
- **Subscription bypass:** `apps/server/src/middleware/subscription.ts` → `isPrivilegedAccount()`
- **Usage limits:** `apps/server/src/services/usageTracking.ts`
- **API:** `GET /api/subscription/status` returns `authority` block
- **Billing safety:** `POST /create`, `/cancel`, `/reactivate`, `GET /billing-portal` reject privileged accounts
- **Web:** `apps/web/src/middleware/roleGuard.ts`, `apps/web/src/lib/accountAuthority.ts`

## Environment variables

| Variable | Account |
|----------|---------|
| `OWNER_EMAIL` / `FOUNDER_EMAIL` | abelxmendoza@gmail.com (founder) |
| `DEVELOPER_EMAIL` | firefistabel@gmail.com (test) |
| `ADMIN_EMAIL` | Admin fallback (falls back to owner if unset) |
| `OWNER_USER_ID` / `FOUNDER_USER_ID` | Optional UUID override |

Set matching `VITE_*` vars in Vercel for client-side role badges.

## Founder data isolation

- `apps/server/src/lib/founderGuard.ts` — blocks synthetic data ops on founder account
- `apps/web/scripts/check-demo-data-privacy.cjs` — CI guard for demo fixtures
- Founder UUID/emails blocked from mock surfaces
- Maintenance scripts require explicit `--user-id` (no hardcoded founder UUID defaults)

## Privilege source labels (Admin Console / Account Center)

| Role | Label |
|------|-------|
| Owner | Platform Authority |
| Admin | Administrative Privilege |
| Developer | Development Privilege |
| Premium | Stripe Subscription |
| Free | Free Tier |

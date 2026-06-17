# Subscription Authority Audit

**Generated:** Launch Readiness Sprint — Phase 4 & 7

## Before

| Mechanism | Behavior | Gap |
|-----------|----------|-----|
| `checkSubscription()` | Implemented | **Not wired to any route** |
| `requirePremium()` | Implemented | **Not wired to any route** |
| `checkEntryLimit` | Wired to `POST /api/entries` | Admin bypass via hardcoded email in `subscription.ts` |
| `checkAiRequestLimit` | Wired to `POST /api/chat` | Same hardcoded email fallback |
| Stripe webhooks | Sync `subscriptions` table | Privileged users could theoretically lose access if Stripe state changes |
| Frontend `FeatureGate` | Defined | **Unused**; references wrong shape |

## After

| Check | Privileged (owner/admin/developer) | Premium (Stripe) | Free |
|-------|-----------------------------------|------------------|------|
| Entry limits | Unlimited | Unlimited | 50/mo |
| AI limits | Unlimited | Unlimited | 100/mo |
| `GET /status` | `planType: premium`, `authority.isPrivileged: true` | Stripe state | `free` |
| `POST /create` | **403 billing_not_required** | Creates subscription | Creates subscription |
| `POST /cancel` | **403 billing_not_required** | Cancels at period end | N/A |
| Billing portal | **403 billing_not_required** | Opens Stripe portal | N/A |

## Billing safety guarantees

1. **Owner cannot be charged** — `isBillingExempt()` blocks all Stripe checkout flows
2. **Admin/Developer cannot be charged** — same guard
3. **Stripe cancellation cannot remove privileged access** — usage + status endpoints use `accountAuthority`, not Stripe alone
4. **No hardcoded founder email in server middleware** — removed from `subscription.ts`; uses `accountAuthority` + env vars

## Files changed

- `apps/server/src/lib/accountAuthority.ts` (new)
- `apps/server/src/middleware/subscription.ts`
- `apps/server/src/services/usageTracking.ts`
- `apps/server/src/routes/subscription.ts`
- `apps/web/src/hooks/useSubscription.ts`
- `apps/web/src/components/subscription/SubscriptionManagement.tsx`

## Remaining recommendations

1. Wire `requirePremium` to specific premium-only routes when identified
2. Fix or remove unused `FeatureGate.tsx`
3. Set `DEVELOPER_EMAIL=firefistabel@gmail.com` on Railway + Vercel
4. Set `app_metadata.role=owner` on founder account in Supabase for belt-and-suspenders

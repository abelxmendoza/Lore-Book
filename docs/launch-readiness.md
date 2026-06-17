# Launch Readiness — Role Authority & Founder Isolation

**Generated:** Phase 9 + Launch Readiness Sprint

## Status summary

| Area | Status |
|------|--------|
| Stripe billing E2E | ✅ Operational (webhook fix deployed) |
| Owner role | ✅ Implemented |
| Admin/Developer privileges | ✅ Premium without billing |
| Subscription authority bypass | ✅ Server + client aligned |
| Account Center UI | ✅ Role badges + privileged subscription panel |
| Admin Console | ✅ Founder warning + role column |
| Founder data isolation | ✅ Guards + privacy CI + script hardening |
| Production backend | ✅ Healthy (`/api/health`, DB schema OK) |

## User flow verification

### Free user
- `GET /api/subscription/status` → `planType: free`, limited usage
- Entry/AI limits enforced at 50/100 per month
- Upgrade path shown in Account Center

### Premium user (Stripe)
- Trial → SetupIntent checkout → webhook sync
- `planType: premium`, unlimited usage
- Cancel/reactivate via Stripe + billing portal

### Owner (abelxmendoza@gmail.com)
- `authority.role: owner`, `isPrivileged: true`
- Account Center: **Owner** badge, "Founder Account · Personal Production Data"
- Subscription tab: no upgrade/billing UI
- Cannot create/cancel Stripe subscription via API

### Admin
- Full admin console access
- Premium included, no billing required
- Subscription tab: **Admin Access · Premium Included**

### Developer (firefistabel@gmail.com)
- Set `DEVELOPER_EMAIL` in Railway/Vercel
- Premium included, dev tools access
- Subscription tab: **Developer Access · Premium Included**

## Required production env (add to Railway)

```bash
OWNER_EMAIL=abelxmendoza@gmail.com
DEVELOPER_EMAIL=firefistabel@gmail.com
# Optional UUID override:
# OWNER_USER_ID=<founder-supabase-uuid>
```

Vercel (mirror for UI badges):

```bash
VITE_OWNER_EMAIL=abelxmendoza@gmail.com
VITE_DEVELOPER_EMAIL=firefistabel@gmail.com
```

## Founder isolation checklist

- [x] Remove hardcoded founder email from `subscription.ts`
- [x] Remove hardcoded founder UUID default from `seedAshleyKnowledge.ts`
- [x] Block founder account in `populate-dummy-data.ts`
- [x] Extend demo privacy CI with founder emails/UUID
- [x] Admin tools show founder data warning
- [ ] Audit remaining maintenance scripts for `--user abelxmendoza@gmail.com` defaults (docs/scripts only — not runtime)

## Pre-launch actions

1. Set `OWNER_EMAIL` + `DEVELOPER_EMAIL` on Railway (if not already)
2. Set matching `VITE_*` on Vercel
3. Optionally set `app_metadata.role = owner` on founder Supabase user
4. Run `node apps/web/scripts/check-demo-data-privacy.cjs` in CI
5. Deploy backend with role authority changes

## Related docs

- [role-authority-model.md](./role-authority-model.md)
- [subscription-authority-audit.md](./subscription-authority-audit.md)

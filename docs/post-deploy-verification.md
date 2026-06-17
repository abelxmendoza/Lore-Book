# Post-Deploy Production Verification Report

**Date:** 2026-06-16  
**Deploy scope:** Stripe fixes, founder isolation, Account Center roles, owner/developer billing bypass, Tailwind/Vercel build fixes  
**Method:** Automated production probes + code-path verification. **No code changes** in this sprint.  
**Verifier:** Agent (automated) — logged-in UI flows require manual confirmation.

**Production URLs**

| Service | URL |
|---------|-----|
| Web (Vercel) | https://lorebookai.com |
| API (Railway) | https://lore-book-production.up.railway.app |

---

## Summary

| Phase | Automated | Manual required |
|-------|-----------|-----------------|
| 1 — Auth | Partial | Yes (per-role login) |
| 2 — Account Center | Not verified | Yes |
| 3 — Billing | API probes only | Yes |
| 4 — Threads | Not verified | Yes |
| 5 — Lore reconstruction | Not verified | Yes |

**Overall:** Infrastructure and security baselines **PASS**. Role-specific UI and end-user flows **NOT VERIFIED** without authenticated sessions for owner, developer, and standard user accounts.

---

## PHASE 1 — Auth

| Flow | Result | Evidence |
|------|--------|----------|
| Production web reachable | **PASS** | `GET https://lorebookai.com` → HTTP 200 |
| Production API reachable | **PASS** | `GET /api/health` → HTTP 200, `deploymentEnv: production` |
| Unauthenticated API blocked | **PASS** | `GET /api/subscription/status` without token → HTTP 401 `Missing Authorization header` |
| Stripe env configured (Railway) | **PASS** | Health payload: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUBSCRIPTION_PRICE_ID` all `true` |
| Supabase env configured | **PASS** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` present |
| Guest login | **MANUAL** | Requires browser: Continue as Guest on `/login` |
| User login (magic link / Google) | **MANUAL** | Requires inbox / OAuth |
| Developer login | **MANUAL** | Sign in as `firefistabel@gmail.com` |
| Owner login | **MANUAL** | Sign in as `abelxmendoza@gmail.com` |
| Logout | **MANUAL** | — |
| Session refresh / persistence | **MANUAL** | Reload after login; check Supabase session |
| Role loading after login | **MANUAL** | Check Account Center badges + `/api/subscription/status` `authority` block |

### Warnings

- **WARNING:** Vercel `/upgrade` response had `age: ~6246s` at time of probe — deploy may predate latest Tailwind/build fixes. Confirm latest commit is promoted on Vercel.
- **WARNING:** `VITE_OWNER_EMAIL` / `VITE_DEVELOPER_EMAIL` must be set on Vercel and redeployed for client-side badges to match server roles.

---

## PHASE 2 — Account Center

| Check | Owner | Developer | Normal user | Result |
|-------|-------|-----------|-------------|--------|
| “Founder Account” label | Expected | N/A | N/A | **MANUAL** |
| “Premium Access Included” | Expected | Expected | N/A | **MANUAL** |
| Subscription tab — privileged panel | Expected | Expected | N/A | **MANUAL** |
| Subscription / Trial / Upgrade for free user | N/A | N/A | Expected | **MANUAL** |
| Role badge in header | “Owner” (code) | “Developer” (code) | None | **MANUAL** |

### Code expectation (for manual checklist)

When signed in, verify at **https://lorebookai.com/account** → Subscription tab:

**Owner (`abelxmendoza@gmail.com`)**

- [ ] Header subline: “Founder Account · Personal Production Data”
- [ ] Subscription panel title: “Owner” (not “Founder Account” — known copy gap)
- [ ] Subtitle includes “Full Platform Access” or “Premium Included”
- [ ] No “Start free trial” / “Manage billing” / cancel buttons

**Developer (`firefistabel@gmail.com`)**

- [ ] Header badge: “Developer”
- [ ] Subscription panel: “Developer Access” + “Premium Included”
- [ ] No checkout or billing portal buttons

**Normal user**

- [ ] Free plan usage bars visible
- [ ] “Start free trial” or upgrade path available
- [ ] No privileged panel

| Result | **NOT VERIFIED** (requires manual login) |

---

## PHASE 3 — Billing

### Automated API probes

| Check | Result | Evidence |
|-------|--------|----------|
| Webhook rejects missing signature | **PASS** | `POST /api/subscription/webhook` → HTTP 400 `Missing stripe-signature header` |
| Unauthenticated subscription API | **PASS** | HTTP 401 |
| Railway Stripe keys present | **PASS** | Health env check |

### Manual per-role checks

| Check | Owner | Developer | User | Result |
|-------|-------|-----------|------|--------|
| No checkout flow | Expected | Expected | N/A | **MANUAL** |
| No cancel subscription | Expected | Expected | User can cancel | **MANUAL** |
| No billing prompts | Expected | Expected | N/A | **MANUAL** |
| `/upgrade` → checkout blocked for privileged | Expected | Expected | N/A | **MANUAL** |
| Full Stripe flow (trial → PaymentElement) | N/A | N/A | Expected | **MANUAL** |
| `POST /create` returns 400 `billing_not_required` for owner/dev | Expected | Expected | N/A | **MANUAL** (curl with JWT) |

**Suggested manual API test (owner JWT):**

```bash
curl -H "Authorization: Bearer $OWNER_JWT" \
  -X POST https://lore-book-production.up.railway.app/api/subscription/create
# Expected: 400 { "error": "billing_not_required" }
```

| Result | **PARTIAL PASS** (API security baselines only) |

### Warnings

- **WARNING:** `vercel.json` still embeds `VITE_STRIPE_PUBLISHABLE_KEY` as **test** key (`pk_test_51L9CLG...`). Production checkout on Vercel may use test mode unless overridden in Vercel dashboard env vars.
- **WARNING:** Latest checkout auth-gate fixes may not be deployed until Vercel rebuild from `main`.

---

## PHASE 4 — Threads

| Flow | Result | Notes |
|------|--------|-------|
| Create thread | **MANUAL** | Requires authenticated session |
| Send message | **MANUAL** | — |
| Refresh / reload browser | **MANUAL** | Thread list persistence |
| Switch threads | **MANUAL** | — |
| Thread ordering | **MANUAL** | — |
| Assistant message persistence | **MANUAL** | — |

| Result | **NOT VERIFIED** |

---

## PHASE 5 — Lore Reconstruction

| Flow | Result | Notes |
|------|--------|-------|
| Relationships recover in chat/context | **MANUAL** | — |
| Events recover | **MANUAL** | — |
| Thread summaries generate | **MANUAL** | — |
| Continuity cards appear | **MANUAL** | — |

| Result | **NOT VERIFIED** |

---

## PHASE 6 — Consolidated Results

### PASS (automated)

- Production web and API online
- Production env vars present (Supabase, OpenAI, Stripe, frontend URL)
- Unauthenticated subscription access rejected (401)
- Stripe webhook signature enforcement (400 without header)
- API deployment environment reported as `production`

### FAIL

- None confirmed by automated probes alone

### WARNING

- Vercel deploy may be stale relative to latest `main` commits (build fix, checkout auth gate, Account Center fix)
- Client role env vars (`VITE_OWNER_EMAIL`, `VITE_DEVELOPER_EMAIL`) must be set on Vercel and redeployed
- Stripe publishable key in committed `vercel.json` is test mode — verify production key in Vercel dashboard
- UI copy differs from sprint spec (“Owner” vs “Founder Account”) — see `docs/role-enforcement-audit.md`
- All logged-in UX flows unverified in this report

### MANUAL — Required before launch sign-off

1. Sign in as **owner** → Account Center → confirm privileged panel, no billing CTAs
2. Sign in as **developer** → same checks
3. Sign in as **standard user** (or create test account) → complete Stripe trial checkout on `/upgrade`
4. Owner/dev: confirm `POST /api/subscription/create` returns `billing_not_required`
5. Create thread → send messages → hard refresh → confirm persistence
6. Ask a relationship/event recall question → confirm continuity card / memory retrieval

---

## Recommended next steps

1. **Redeploy Vercel** from latest `main` (tailwind deps + AccountCenter + CheckoutFlow auth gate).
2. **Confirm Vercel env:** `VITE_OWNER_EMAIL`, `VITE_DEVELOPER_EMAIL`, live `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_USE_MOCK_DATA=false`.
3. **Run manual checklist** above with owner + developer + test user accounts.
4. **Re-run this verification** after deploy and attach screenshots or curl outputs to this doc.

---

**Related:** `docs/role-enforcement-audit.md`, `docs/launch-readiness.md`

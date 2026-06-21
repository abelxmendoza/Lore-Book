# CodeQL / Trivy alert triage

Status as of 2026-06-21 (branch `security/codeql-redos-sanitization`).

This file records the disposition of every open code-scanning alert so the
remaining false positives can be bulk-dismissed in the GitHub Security tab.
`gh` is not installed in the dev environment, so the dismissals below must be
applied from the UI (or via the REST API with a token) — see the bottom.

---

## Fixed in code (this branch)

| Alert(s) | Query | Fix | Commit |
|---|---|---|---|
| ReDoS (18 files) | `js/polynomial-redos` | Bounded quantifiers (`{1,40}`, `{0,80}`, `{1,120}`) replace ambiguous unbounded repetition; provably linear. | `732ab69` |
| #680 | regex injection | Escape user-derived text before `new RegExp` in `spanToOperationMapper`. | `732ab69` |
| #39–41, #66–70 | incomplete multi-char sanitization | `web/security.ts` now uses DOMPurify (browser) + full HTML-entity escaping (SSR) instead of hand-rolled stripping. | `732ab69` |
| #625 | esbuild dev-server CORS (GHSA-67mh-4wv8-2f99, <0.25.0) | Deleted `apps/web/reproduction/` — a dead `console.log('app')` esbuild playground that was the only carrier of esbuild 0.24.2. Real lockfiles already resolve to 0.25.12 (web) / 0.27.2 (server). | `7cce77f` |

---

## False positives — safe to dismiss ("won't fix" / "used in tests" as noted)

### ~23× `js/missing-rate-limiting` — dismiss as **false positive**

Every flagged route handler mounts under `apiRouter`, which is mounted at
`app.use('/api', apiRouter)` (`apps/server/src/index.ts:237`). Immediately
before it in the chain, `app.use('/api', tieredRateLimit)`
(`index.ts:162`) applies a real, enforcing, Postgres-backed rate limiter to
**every** `/api/*` request:

```
read           1200 / 15m       ai               45 / 15m
write           300 / 15m       compute          35 / 15m
write_burst      90 / 1m        auth_sensitive   12 / 15m
webhook         120 / 15m       guest            20 / 15m
                                public_probe     30 / 15m
```

(`apps/server/src/middleware/tieredRateLimit.ts:36-45`, returns `429` at
line 146.) The Stripe webhook also gets it explicitly at `index.ts:148`.

CodeQL's `js/missing-rate-limiting` only recognizes inline
`express-rate-limit` `rateLimit()` calls on the route itself; it cannot trace
an app-level custom limiter, so it flags handlers that are in fact limited.
**Reason for dismissal: false positive — rate limiting is enforced globally
by `tieredRateLimit` at `index.ts:162`.**

### vercel.json "exposed secret" (Trivy) — dismiss as **false positive**

- `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) is a Stripe **publishable** key —
  designed to ship in the browser bundle.
- `VITE_SUPABASE_ANON_KEY` is the Supabase **anon** key — designed to ship in
  the browser bundle; access is gated by RLS, not by key secrecy.

Neither is a secret. (They trip secret-scanners only because any JWT-shaped or
`pk_`-prefixed string matches the pattern.) **Reason: false positive — public
client-side keys, not secrets.**

### #624 dompurify advisory — already resolved

dompurify resolves to **3.4.11** (web `package-lock.json`) and **3.4.8** (stale
`apps/web/pnpm-lock.yaml`), both above the advisory floor (3.2.4, mXSS
GHSA-vhxf-7vqr-mrjg). No vulnerable copy is tracked. Dismiss as **already
fixed**; if it persists, it is scanning a stale lockfile snapshot.

---

## Follow-ups (not security-blocking)

- **Stale `apps/web/pnpm-lock.yaml` (Jun 10)** coexists with the canonical
  `apps/web/package-lock.json` (npm, Jun 20). It is not a vulnerability source
  (esbuild 0.27.7, dompurify 3.4.8 there) but gives scanners a second,
  divergent dependency graph. Consider removing it if the project is npm-only.

---

## How to apply the dismissals

UI: **Security → Code scanning** (CodeQL) and **Security → Dependabot/Trivy**,
filter by the queries above, multi-select, "Dismiss → False positive" (or
"Used in tests" / "Won't fix") with the reason text above.

API (needs a token with `security_events` scope):

```bash
# list open alerts
gh api repos/abelxmendoza/Lore-Book/code-scanning/alerts --paginate \
  -q '.[] | select(.state=="open") | {number, rule: .rule.id}'

# dismiss one
gh api -X PATCH repos/abelxmendoza/Lore-Book/code-scanning/alerts/<N> \
  -f state=dismissed -f dismissed_reason=false_positive \
  -f dismissed_comment="Rate limited globally by tieredRateLimit (index.ts:162)"
```

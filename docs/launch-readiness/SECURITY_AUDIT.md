# SECURITY AUDIT

Central question: **Could User A ever access User B's memories?**

Short answer: **Not via the paths spot-checked, but the architecture gives you no
second line of defense — API-layer authorization is the *only* tenant boundary.**
That must be treated as a P0 invariant and audited route-by-route.

---

## The core posture finding

The server uses the **service-role** Supabase client (`supabaseAdmin`) pervasively
— on the order of **1,600+ usages across the service layer**. The service role
**bypasses Row-Level Security**. Therefore:

- RLS is **not** an effective backstop on the API path. If a handler scopes a query
  by the wrong `user_id`, RLS will not catch it.
- Every data read/write's correctness depends entirely on the handler passing
  `req.user.id` (verified from the JWT) and never a client-supplied id.

This is a defensible architecture (common for trusted backends) **only if** every
route is disciplined. It removes your safety net, so the discipline must be
enforced and tested.

---

## Findings

### P0
1. **Service-role bypass = no defense-in-depth.** Any single handler that scopes by
   a client-supplied id leaks cross-user data with no RLS to stop it. Mitigation:
   (a) a lint/test that flags `req.query/body/params.userId` reaching a DB call;
   (b) keep RLS enabled and correct anyway, and add a small set of **user-scoped
   (anon-key + JWT) read paths** for the most sensitive reads as a backstop.

### P1
2. **Client-supplied `userId` patterns exist.** Spot-check:
   - `routes/ontology.ts:20,38` reads `req.query.userId` — **but is `requireAdmin`-
     gated**, so this is legitimate admin tooling. ✅ verified safe.
   - `routes/admin.ts:229` reads `req.query.userId` — admin surface. Verify all
     `/api/admin/*` is behind `requireAdmin`.
   - **Action:** grep-gate confirmed only admin routes use this pattern today; add a
     test so a non-admin route can never introduce it.
3. **Per-user rate limiting / abuse.** Expensive routes use `guardOpenAiRoute()` +
   `checkAiRequestLimit` (e.g. onboarding analyze/detect-personas), and there is a
   tiered rate limiter (`/api/` `tieredRateLimit`). Verify the **chat stream** path
   enforces a per-user budget — it increments `incrementAiRequestCount`
   (chat.ts:294) but confirm it also *blocks* over-limit, not just counts. **P1.**

### P2
4. **Memory poisoning / prompt injection.** User-originated text becomes stored
   canon and re-enters future prompts. A user can deliberately poison **their own**
   memory (low blast radius — self-only) but injected instructions inside stored
   claims could steer later responses. The new Response Compiler constrains the
   *assistant* side (claims need provenance, can't self-promote to canon), which
   helps. Add input sanitization / instruction-stripping on stored claim text.
5. **Guest path isolation.** `/api/guest/stream` uses a guest id and a guest lore
   snapshot; confirm guest data can never be addressed with a real `user_id` and
   that guest ids are unguessable.
6. **Secrets / keys.** `.env` holds the hosted `DATABASE_URL` (pooler) and service
   role. Ensure these are never shipped to the web bundle and are rotated; confirm
   `VITE_*` only carries public values.

### P3
7. Dependabot: `esbuild ≤0.24.2` dev-only advisory (#249) — bump to 0.25.0.

---

## Verdict

No confirmed cross-user leak on the paths examined, and the one risky-looking
pattern (`req.query.userId`) is admin-gated. **But** because service-role disables
RLS everywhere, "User A cannot read User B" is currently a *convention enforced by
hand*, not a *guarantee enforced by the database*. Before serving thousands of
strangers' real life data, convert it into a guarantee: keep RLS correct, add a
CI check banning client-supplied ids on non-admin routes, and pen-test the chat +
entity read endpoints with a second user's token.

---

## Remediation status (2026-06-22)

- ✅ **CI user-isolation guard shipped** — `scripts/check-user-isolation.cjs`
  (`npm run check:user-isolation`, wired into CI). Fails the build if any
  non-admin route scopes a query by a client-supplied `userId`, unless waived with
  `// user-isolation-ok`. Converts the hand-enforced convention into an enforced
  invariant. Verified: passes today; catches an injected non-admin violation.
- ✅ **Per-user spend cap confirmed blocking** — chat `/stream` and `/` run
  `checkAiRequestLimit` *before* the handler, which returns **403** on over-limit
  (per-user AI request limit) or `openai_budget_exceeded` (global budget, also
  enforced in `guardedOpenAiCall` via `assertOpenAiBudgetAvailable`). Not just a
  counter — it blocks.
- ⏳ Still open (P1/P2): keep RLS correct as a backstop; pen-test entity/chat reads
  with a second user's token; input sanitization on stored claim text (poisoning);
  guest-id unguessability; esbuild dev bump (#249).

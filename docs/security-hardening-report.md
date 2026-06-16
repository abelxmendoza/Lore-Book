# Security Hardening Report

Date: 2026-06-16 · Audit only (no code changed). Evidence: Supabase security advisors + direct `pg_policies`/`pg_proc` queries on project `cshtthzpgkmrbcsfghyq`.

## Phase 1 — Security Audit

| # | Issue | Risk | Real exploitability | Recommended fix | Priority |
|---|---|---|---|---|---|
| S1 | **`get_event_explanation(event_id)`** is `SECURITY DEFINER` and **executable by `anon`** via `/rest/v1/rpc/` | Cross-user data read — bypasses RLS, returns any user's event meaning | **Medium.** Real RLS bypass; gated only by UUID unguessability. An attacker with any leaked/enumerated event UUID reads another user's data unauthenticated | `REVOKE EXECUTE ... FROM anon, authenticated;` or switch to `SECURITY INVOKER` | **P0** |
| S2 | **`can_reverse_event(event_id)`** — same pattern | Cross-user probe of event state | Medium (same as S1) | Revoke anon/authenticated EXECUTE | **P0** |
| S3 | **`initialize_free_subscription()`** executable by `anon` | Unauthenticated row creation / billing-state abuse | **Medium.** If it writes using `auth.uid()`, an `anon` call has null uid → either errors or writes a junk row; either way an unauthenticated, side-effecting `SECURITY DEFINER` write is exposed | Revoke `anon` EXECUTE; restrict to `authenticated`; verify it derives user from `auth.uid()` | **P0** |
| S4 | **`has_accepted_latest_terms(user_id, version)`** executable by `anon` | Info disclosure — probe whether any user accepted ToS | Low (minor PII signal) | Revoke `anon` EXECUTE | **P1** |
| S5 | **3 SECURITY DEFINER views**: `provenance_edges_export`, `pipeline_runs_incomplete`, `omega_claims_with_evidence` | Views run as creator → RLS of the *querying* user is not enforced | **Low–Medium.** Exposure depends on whether `anon`/`authenticated` have SELECT on the views; they bypass per-user RLS by design | Recreate with `security_invoker = true` (PG15) or revoke API access | **P1** |
| S6 | **`epiphany_insights`** INSERT policy `WITH CHECK (true)` | RLS bypass on insert | Low–Medium — depends on whether the policy targets `anon`/`authenticated` (advisor role shows `-`). If it does, anyone can insert | Scope the policy to `service_role`, or `WITH CHECK (auth.uid() = user_id)` | **P1** |
| S7 | **~30 functions with mutable `search_path`** (`match_journal_entries`, `update_updated_at_column`, `sync_chronology_index`, …) | `search_path` hijack if a malicious object is created in an earlier-resolved schema | Low (most are trigger fns; needs another foothold first) | `ALTER FUNCTION … SET search_path = ''` (batchable) | **P2** |
| S8 | **`vector`, `pg_trgm` extensions in `public`** | Namespace pollution; minor hardening gap | Low | Move to an `extensions` schema | **P3** |
| S9 | **Leaked-password protection disabled** (HaveIBeenPwned) | Weak/compromised passwords accepted | Low–Medium (account takeover via credential stuffing) | One-click enable in Auth settings | **P2** |
| S10 | **Service-role key usage** — backend uses `supabaseAdmin` (service role) for nearly all queries | Service role bypasses ALL RLS; a single SSRF/injection in the API = full data access | **By design, but high blast radius.** Not a leak today, but it means RLS is *not* the real boundary — the Express auth middleware is. Every route must enforce `user_id` scoping itself | Audit that every `supabaseAdmin` query filters by the authenticated `user_id`; never interpolate user input into SQL | **P1 (ongoing)** |

**Auth bypass opportunities:** the real authorization boundary is the Express `authMiddleware` + per-query `user_id` filters, **not** Postgres RLS (because the backend uses the service role). This is a valid architecture but means: (a) any route that forgets `.eq('user_id', …)` leaks cross-user data, and (b) `DISABLE_AUTH_FOR_DEV` must never be true in prod (it hard-fails in prod per `index.ts` — verified). The anon-executable RPCs (S1–S4) are the one place the service-role architecture is bypassed and PostgREST is exposed directly — hence their P0 status.

## Phase 2 — RLS Lockdown

RLS is **enabled on every audited table**. Findings by disposition:

### DELETE (redundant / unsafe policies)
- **`epiphany_insights`** — the `WITH CHECK (true)` INSERT policy (S6). Replace with a `user_id`-scoped or service-role-only policy.

### MERGE (duplicate/redundant permissive policies — perf + clarity)
Tables with **>4 policies** carry redundant permissive policies (one extra permissive policy per role/action forces re-evaluation; flagged as 130 `multiple_permissive_policies` lints):
- **`people_places` (8)**, **`chapters` (8)** — heaviest; consolidate to one policy per action.
- **`arc_memberships` (5)`, `life_arcs` (5)`, `arc_relationships` (5)`, `event_candidates` (5)** — merge the duplicate pair on each.

### KEEP (correct, standard)
- The ~30 tables with exactly **4 policies** (one per SELECT/INSERT/UPDATE/DELETE, all `auth.uid() = user_id`) are correct. Keep as-is — but see the `auth_rls_initplan` perf note in `runtime-cost-audit.md` (wrap `auth.uid()` in a subselect).

### REVIEW (RLS enabled, **zero policies** = deny-all to anon/authenticated)
- `character_memories`, `character_relationships`, `memoir_outlines`, `memory_components`, `original_documents`.
- **Not a leak** (deny-all is safe), but it means these tables are **only reachable via the service-role backend**, never via direct PostgREST. Confirm no frontend code queries them through the anon client (it would silently return empty). If direct access is intended, add `auth.uid() = user_id` policies; otherwise document them as backend-only.

**Cross-user leakage:** none found at the DB layer — every policy keys on `auth.uid() = user_id`. The residual risk is entirely at the **application layer** (service-role queries missing a `user_id` filter), which RLS cannot catch. That audit belongs in code review, not the linter.

## Highest-ROI security fixes (do before next feature sprint)
1. **P0 — Lock down the 4 anon-executable RPCs** (S1–S4): a handful of `REVOKE EXECUTE` statements. Closes the only real unauthenticated cross-user read/write surface. ~10 minutes.
2. **P1 — Fix `epiphany_insights` policy + convert the 3 SECURITY DEFINER views** to `security_invoker`. ~30 minutes.
3. **P1 — Spot-audit `supabaseAdmin` queries** for missing `user_id` filters (the real boundary). Highest-impact, ongoing.
4. **P2 — Enable leaked-password protection + batch `SET search_path`** on the flagged functions. Low effort.

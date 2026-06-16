# Production Readiness Score

Date: 2026-06-16 · Audit only. Scores are judgment calls grounded in this sprint's evidence (Supabase advisors, query-pattern analysis, OpenAI fan-out, Railway logs, reconstruction scorecard). 0–100, where 100 = ready for significant scale.

## Scorecard

| Dimension | Score | Basis |
|---|---|---|
| **Security** | 64 | RLS enabled on every table; auth middleware enforces user scoping. **But:** 4 anon-executable `SECURITY DEFINER` RPCs (real RLS bypass), 3 SECURITY DEFINER views, service-role architecture means RLS isn't the real boundary, leaked-password protection off. Fixable fast (all P0/P1 are SQL/dashboard). |
| **Reliability** | 60 | Server boots clean; ingestion is non-blocking (failures don't break chat). **But:** OpenAI **429 is actively firing** in prod, no global rate limiter/backoff, background workers compete for quota. |
| **Scalability** | 55 | Recovery is throttled ✅. **But:** `workingMemoryAssembler` runs 19 queries + N+1 **per message**; 6–12 OpenAI calls/message; 281 per-row `auth.uid()` RLS evals; in-memory cooldown/cache state is single-instance (blocks horizontal scaling). |
| **Durability** | 80 | Thread durability live; container-delete enforced (RESTRICT + guard); knowledge survives thread deletion; daily backups. Schema drift that caused live errors is now fixed. |
| **Data Integrity** | 74 | Schema drift resolved; recovery idempotent (no dup writes); provenance tracked. **But:** residual risk = service-role queries missing a `user_id` filter (RLS can't catch it); needs code-review pass. |
| **Memory Trust** | 80 | Epistemic honesty (no fabrication), recall chain green, continuity card, confidence scoring. Strong by design. |
| **Recovery** | 82 | Relationship + event recovery live on chat path, idempotent, debounced, diagnostics in `pipeline_runs`. The strongest area this sprint. |
| **Timeline Integrity** | 70 | Timeline benchmark 8/8 on the reconstruction scorecard; temporal anchoring works. **But:** episode segmentation never wired (dead core) — the timeline spine is event-based, not scene-based. |
| **Relationship Integrity** | 77 | Recovery + scoring live; relationshipAccuracy ~79 on scorecard; drift/cycle detection. Re-touch write amplification is a minor wart. |
| **Overall** | **69** | Solid core (recovery, durability, memory trust) held back by **security exposure (anon RPCs)** and **scalability/cost (per-message OpenAI + assembler N+1 + active 429s)**. |

## What moves the number most (highest ROI, ranked)

1. **Lock down 4 anon RPCs (P0 security)** — `REVOKE EXECUTE`, ~10 min. Security 64 → ~78. *Closes the only real unauthenticated cross-user surface.*
2. **Cut per-message OpenAI fan-out + add a rate limiter (reliability/scale)** — gate normalization/splitting behind heuristics, batch knowledge-type, token-bucket the client. Reliability 60 → ~75, Scalability 55 → ~65. *Directly fixes the active 429.*
3. **`(select auth.uid())` RLS rewrite + drop 5 duplicate indexes (scale)** — one migration, no app change. Scalability +~5 across the board.
4. **Batch + memoize `workingMemoryAssembler` (scale)** — removes the per-message N+1. Scalability +~5.
5. **Audit `supabaseAdmin` queries for `user_id` filters (data integrity)** — the real authorization boundary. Data Integrity 74 → ~85.
6. **Delete the 3 dead files + convert SECURITY DEFINER views (hygiene/security)** — low effort, removes ambiguity.

## Recommended sequence before the next feature sprint
**Week 1 (security + unblock):** #1 anon RPCs, raise OpenAI quota, #2 rate limiter + heuristic gating.
**Week 2 (scale + integrity):** #3 RLS perf migration, #4 assembler batching, #5 service-role filter audit.
**Ongoing/hygiene:** #6 dead code + SECURITY DEFINER views + leaked-password toggle.

Target after Week 1–2: **Overall ~80**, with the two weakest dimensions (Security, Reliability) brought in line with the strong core.

## Bottom line
LoreBook's **memory/recovery core is production-grade** (the hard part). The gaps are classic pre-scale hardening: a small, well-defined set of **security exposures** and **per-message cost** problems — all fixable with SQL + targeted gating, **no redesign required**. The single most urgent item is the 4 anon-executable RPCs; the single most impactful for scale is cutting the per-message OpenAI fan-out.

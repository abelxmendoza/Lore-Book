# LAUNCH READINESS MASTER REPORT

Role lens: Staff Engineer / Product Architect / Reliability / CTO.
Assumption: **feature development is frozen.** Goal: make LoreBook trustworthy,
scalable, and investable around its one job — *remember and use a user's life over
time.*

Companion docs: `RELIABILITY_AUDIT.md`, `COST_PER_MESSAGE.md`,
`PERFORMANCE_AUDIT.md`, `SECURITY_AUDIT.md`, `AHA_MOMENT_AUDIT.md`,
`FEATURE_REALITY_REPORT.md`, `INVESTOR_READINESS_REPORT.md`.

## The one-sentence finding
The product's hard parts (a provenance-aware life graph, grounding, correction)
are built and differentiated; what's missing is **durability of memory formation,
measured unit economics, and focus** — not features.

---

## 1. Top 10 launch blockers (P0)
1. **In-memory ingestion queue** — memory is lost on any restart/deploy/OOM. The
   core promise isn't durable. (RELIABILITY P0)
2. **No unified resolve-before-write identity gate** — duplicate/over-merge writes
   silently corrupt recall. (RELIABILITY P0)
3. **Silent ingestion failure** — fire-and-forget `.catch()` ingestion with no
   per-message success guarantee or retry. (RELIABILITY P0)
4. **Unmeasured cost per message** — ~10–18 model/embedding calls estimated; no real
   number. Launch economics unknown. (COST P0)
5. **First-session aha is a coin flip** — gated by #1/#3; same-session recall not
   guaranteed. (AHA P0)
6. **Silent recall misses** — retrieval errors read as "no memory." (RELIABILITY P1→P0 for trust)
7. **Service-role-everywhere / no RLS backstop** — cross-user isolation is hand-
   enforced, not DB-guaranteed. (SECURITY P0)
8. **Per-user spend/rate cap on chat unverified** — counts requests; confirm it
   *blocks* over-limit (429 + cost protection). (SECURITY/COST P1→P0)
9. **Mid-stream crash can lose the assistant turn** — no outbox on final persist.
10. **Focus risk** — 79 experimental routes + 348 services dilute the reliability
    budget; launch must run `CORE_RUNTIME` only. (FEATURE REALITY)

## 2. Top 10 scalability blockers
1. In-memory queue can't scale horizontally (per-process state).
2. Per-message LLM fan-out (5–6 decorator calls) → cost + 429s under load.
3. WMA N+1 / full-table scans (16 queries/msg → target 6–8).
4. Entity-resolution 500-row pool loads per message/unit.
5. No durable job dedup/idempotency → repeated work on retries.
6. Synchronous decorator chain inflates p95 latency.
7. Background fire-and-forget jobs multiply DB/LLM load per message.
8. No measured p50/p95 latency or throughput ceiling.
9. Embedding cache effectiveness on hot path unverified.
10. Single shared OpenAI budget → one noisy user can 429 everyone.

## 3. Top 10 reliability risks
1–3 as launch blockers #1–3. 4. No ingestion/retrieval retry. 5. Ordering race:
ingestion lag vs next message → duplicate identities. 6. Duplicate processing
across ingestion fan-out. 7. Compaction mutates thread history fire-and-forget.
8. No idempotency keys. 9. Retrieval has no health/correctness metric.
10. Shadow cores (`entityResolutionCore`, `episodeSegmentationCore`) = unwired
"done-looking" code masking real gaps.

## 4. Top 10 cost reductions
1. **Measure first** (`cost:ingestion` / `stage.timing` already exist).
2. Collapse 5–6 decorator LLM calls into **one** structured call.
3. Gate decorators behind cheap heuristics (skip on most messages).
4. Move non-essential decorators off the latency path.
5. Durable idempotent ingestion → kill repeat extraction/resolution.
6. Verify embedding cache hits on hot path.
7. Cap resolution pool loads with indexed pre-filters.
8. Lower cadence / gate unsurfaced background jobs (memoir, lifestory, epiphany).
9. Use a smaller model for decorator/extraction calls; reserve the top model for
   the final answer.
10. Per-user budget caps to bound worst-case spend.

## 5. Top 10 security risks
1. Service-role bypasses RLS everywhere (no backstop). 2. Add CI ban on client-
   supplied `userId` reaching DB on non-admin routes. 3. Confirm all `/api/admin/*`
   is `requireAdmin`. 4. Verify chat per-user rate/budget enforcement. 5. Memory
   poisoning / prompt injection via stored claim text. 6. Guest-path isolation +
   unguessable guest ids. 7. Secret hygiene (service role / DATABASE_URL never in
   web bundle; rotate). 8. Keep RLS correct as a backstop even if unused. 9. Pen-
   test entity/chat reads with a second user's token. 10. Dependabot esbuild (#249,
   dev-only) bump.

---

## 6. Fastest path to 100 users
Goal: prove the loop works for real people without embarrassment.
1. **Durable ingestion queue + idempotency** (DB outbox/pg-boss). #1 reliability fix.
2. **One resolve-before-write identity gate** (promote `entityResolutionCore`).
3. **Measure cost + latency + ingestion-success** on the live path.
4. **Engineer one deterministic first-session callback** with a provenance chip.
5. Launch **CORE_RUNTIME only**; keep experimental off; delete ~48 dead files.
6. Make recall failures legible (no silent empties).

## 7. Fastest path to 1,000 users
Goal: it stays up and stays cheap under concurrency.
1. **Collapse/parallelize decorator LLM calls** (cost + latency).
2. **Fix WMA N+1 / full-table scans.**
3. **Per-user budget + rate caps**; isolate OpenAI spend per user.
4. **Durable queue that scales horizontally** (shared Redis/pg, not per-process).
5. Cap resolution pool loads; verify embedding cache hits.
6. Add error monitoring + alerting + an ingestion-success dashboard.
7. Load test to find the throughput ceiling and the first thing that breaks.

## 8. Fastest path to investor readiness
Goal: a metrics-backed, differentiated story.
1. **Numbers:** cost/message, cost/active-user, gross margin, ingestion-success
   rate, recall hit-rate, D1/D7 retention, time-to-first-aha.
2. **Reliability proof:** "it remembers every time" backed by the success metric.
3. **Lead with the moat:** provenance + correction + user-owned inspectable memory
   (the Response Compiler is the demo centerpiece).
4. **Reframe surface area** as backlog; demo ONE flawless continuity story
   (Mon "Tony @ SpaceX" → Wed "promoted" → Fri "who's in aerospace?").
5. De-risk key-person: document the core, delete the dead.

---

## Sequenced 6-step plan (do in this order)
1. **Measure** cost + latency + ingestion-success on the live chat path (instrument
   exists; no code-cutting until the numbers exist).
2. **Durable ingestion queue + idempotency** (reliability + aha + scale).
3. **Single resolve-before-write identity gate** (stop silent corruption).
4. **Collapse decorator LLM calls + fix WMA N+1** (cost + latency).
5. **Security gate**: CI check on client-supplied ids + confirm per-user budget caps.
6. **First-session aha**: deterministic provenance-backed callback in onboarding.

Everything above improves reliability, retention, cost, security, or first-session
memory magic. No new product features required.

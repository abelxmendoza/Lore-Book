# Runtime Stability Report

Date: 2026-06-16 · Phase 3 (timeout cascade) + Phase 5 (immediate safety fixes). Goal: stop the 4 GB OOM crash-loop and restore `localhost:4000` / production.

## Phase 3 — Timeout cascade analysis (HeadersTimeoutError / ECONNRESET)

**What's happening:**
- The society pass invokes `societyResolver.callModel` (OpenAI) across many clusters. Production is already **429-ing** on `societyResolver` (Railway logs).
- OpenAI client is configured `maxRetries: 2`, `timeout: 30_000` ([lib/openai.ts](../apps/server/src/lib/openai.ts)). Under a 429 storm, each call burns up to 3 attempts; a global concurrency semaphore (Composer's Stability Sprint) bounds parallelism but **not total queued work**.
- `HeadersTimeoutError` / `ECONNRESET` = upstream (OpenAI/Supabase) connections hanging or being reset while the worker keeps building graphs and allocating. The in-flight request objects + buffered partial responses + the promise closures awaiting them are **retained on the heap** until they settle or the process dies.

**Are requests retrying infinitely / queueing infinitely / leaking?**
- **Retrying infinitely:** No — `maxRetries: 2` bounds retries per call.
- **Queueing infinitely:** **Effectively yes within a run** — the society/cycle builders enqueue work for every cluster/org/context with no per-run ceiling; under timeouts the queue drains slower than it fills.
- **Storing failed responses:** Partially — buffered response chunks + error objects for hung requests are retained until settle.
- **Leaking closures:** **Yes** — promises awaiting hung OpenAI/Supabase calls keep their closure scope (and the graph data they reference) alive, defeating GC during the run.

**Cascade:** OpenAI 429/timeout → requests hang (HeadersTimeoutError) → promises + buffers + the graph they close over stay on the heap → graph build keeps allocating → heap → 4 GB → **OOM kills the process** → HTTP server dies → `ECONNREFUSED 127.0.0.1:4000` / production 502 → restart → worker runs again → repeat.

## Phase 5 — Immediate safety fixes (no refactor, no new architecture)

### P0 — Disable the worker (restores the backend immediately)
- **Action:** stop `groupDetectionWorker.start()` from running — gate it behind an env flag (e.g. `ENABLE_GROUP_DETECTION !== 'true'`) in `runBootTasks()`, defaulting OFF.
- **Why:** it is the sole trigger of the OOM and is a background enrichment with **zero request-path impact**. Disabling it stops the crash-loop and brings `localhost:4000` / prod back up. Highest ROI, lowest risk, reversible by env.

### P1 — Limit concurrency / bound the work per run (when re-enabled)
- Cap **graph node count per run** (e.g., skip/aggregate once nodes exceed N) so the O(n²) edge build can't run away.
- Lower society cadence (6 h → daily) and reduce `BACKFILL_DAYS` / caps.
- Add a hard per-user time/allocation budget; bail out instead of building unbounded.

### P2 — Bound the caches
- Give `societyResolver.cache`, `groupDetectionService.characterNameCache`, `groupCandidateService.rejectionCache` a **max size with LRU eviction** (or `.clear()` at the end of each run). Eliminates the cross-cycle ratchet.
- Don't load all orgs with full subgraphs at once — chunk `organizationService` fan-outs ([organizationService.ts:1164](../apps/server/src/services/organizationService.ts)).

### P3 — Add memory diagnostics
- Log `process.memoryUsage().heapUsed` at the start/end of each worker run + node/edge counts in the co-occurrence graph.
- Run Node with `--max-old-space-size=2048 --heapsnapshot-near-heap-limit=1` in staging to capture the dominant retainer and confirm (expected: `CoOccurrenceGraph.edges` / `SocietyResolver.cache`).
- Add a graceful-shutdown handler (`SIGTERM` → `server.close()` + clear intervals) so restarts release port 4000 cleanly (also fixes the `tsx watch` "Process hasn't exited. Killing process…" churn locally).

## Recommended immediate action
**Apply P0 now.** It is a one-line env gate that stops the production-blocking crash-loop. P1–P3 are the durable follow-ups before re-enabling group detection. Nothing else needs to change to bring the backend back up.

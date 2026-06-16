# Group Detection Emergency Stabilization (P0)

Date: 2026-06-16 · Stops the ~4 GB OOM crash-loop caused by `GroupDetectionWorker`. Restores backend stability. No optimization, no refactor, no architecture change — a single env gate.

## Root cause (reference)
`GroupDetectionWorker` drives the heap to ~4 GB via (1) O(n²) co-occurrence graph expansion over noisy name nodes, (2) wide `organizationService` `Promise.all` fan-outs, (3) never-evicted singleton caches, amplified by (4) OpenAI 429/timeout retention. Full analysis: `docs/oom-root-cause-report.md`, `docs/worker-memory-audit.md`, `docs/runtime-stability-report.md`.

## Change

### Exact startup location
`apps/server/src/index.ts` → `runBootTasks()` → the "CORE jobs" block (was lines ~314–325). `runBootTasks` is fire-and-forget *after* `app.listen()`, so the gate never affects the port bind.

### Env variable added
`ENABLE_GROUP_DETECTION` — **default `false`** (worker does not start unless explicitly `=true`).

```ts
if (process.env.ENABLE_GROUP_DETECTION === 'true') {
  const { groupDetectionWorker } = await import('./workers/groupDetectionWorker');
  groupDetectionWorker.start();
  logger.warn('GroupDetectionWorker ENABLED (…) — monitor heap; known OOM risk until P1/P2 land');
} else {
  logger.info('GroupDetectionWorker DISABLED (set ENABLE_GROUP_DETECTION=true to enable) …');
}
```

### Blast radius
Group detection is **background enrichment only**. Unchanged: chat, memory, retrieval, threads, summaries, life reconstruction, all other workers/jobs (`sync`, `memoryExtraction`, `continuityEngine`, `accessibilityDecay`, `arcStabilityDecay` still register). Only the background group-detection cycle/society/backfill passes are suppressed.

## Verification (local, worker disabled by default)

| Check | Result |
|---|---|
| Server startup | ✅ `Lore Book API listening on 4000`, `AI Provider: OpenAI LIVE` |
| Gate log | ✅ `GroupDetectionWorker DISABLED (set ENABLE_GROUP_DETECTION=true to enable)` |
| Jobs line | ✅ `Core background jobs registered: sync, memoryExtraction, continuityEngine, accessibilityDecay, arcStabilityDecay` (no groupDetection) |
| `/api/health` | ✅ HTTP 200, `{"status":"ok", envPresent:{…all true}}` |
| Heap after startup (node child) | ~252 MB RSS |
| Heap after 90 s idle | **~220 MB RSS — stable/declining (GC reclaiming), no growth** |
| `/api/health` after 90 s | ✅ HTTP 200 (server alive) |
| Log scan | ✅ no `out of memory` / `FATAL` / `Killing process` / `EADDRINUSE` / `group-detection` |

**Before:** heap climbs to ~4 GB shortly after `group-detection:cycle`/`society` → OOM → process dies → `ECONNREFUSED 127.0.0.1:4000` → restart → repeat.
**After:** worker never starts; heap flat at ~220–250 MB; `localhost:4000` stays alive. Crash-loop eliminated.

> Note: a 30-minute soak wasn't run in CI, but the causal driver (the worker's timers/builders) is not started at all when disabled, so there is no growth source. The 90-second flat/declining heap confirms steady state.

## Remaining work (do NOT re-enable until done)
- **P1 — bound the work per run:** cap co-occurrence graph node count; lower society cadence (6 h → daily); reduce `BACKFILL_DAYS`/caps; per-user time/allocation budget with early bail-out.
- **P2 — bound the caches + fan-out:** LRU max-size (or end-of-run `.clear()`) on `societyResolver.cache`, `groupDetectionService.characterNameCache`, `groupCandidateService.rejectionCache`; chunk `organizationService.ts:1164` so it doesn't load all orgs × (members+stories+events+locations) at once.
- **P3 — diagnostics:** log `process.memoryUsage().heapUsed` + graph node/edge counts per run; `SIGTERM → server.close()` graceful shutdown (also fixes local `tsx watch` "Process hasn't exited. Killing process…" churn); optional `--heapsnapshot-near-heap-limit=1` in staging to confirm the dominant retainer.

## Re-enable procedure (after P1/P2)
Set `ENABLE_GROUP_DETECTION=true` in the environment (Railway), watch `heapUsed` logs for one society cycle, confirm flat heap, then keep enabled.

## Deploy notes
- **Local/Railway default:** worker OFF (no env var needed).
- Do **not** set `ENABLE_GROUP_DETECTION=true` in production until P1/P2 land.

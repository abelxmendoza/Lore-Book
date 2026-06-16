# Worker Memory Audit

Date: 2026-06-16 · Every recurring worker/job: schedule, concurrency, retry, memory footprint, risk. Source: `runBootTasks()` in `index.ts` + the worker files.

## Boot-registered workers/jobs (what actually runs)

| Worker / job | Schedule | Concurrency | Retry | Memory footprint | Risk |
|---|---|---|---|---|---|
| **GroupDetectionWorker — society** | every **6 h** (+startup) | 2 users | OpenAI maxRetries 2 | **HIGH** — reads whole history → O(n²) co-occurrence graph + unbounded singleton caches | **🔴 CRITICAL (OOM source)** |
| **GroupDetectionWorker — cycle** | every **15 min** | 2 users | — | **HIGH** — per-conversation detection + org fan-out (`getOrganization` × all orgs) | **🔴 CRITICAL** |
| **GroupDetectionWorker — backfill** | once, 90 s after boot | 2 users | — | **HIGH** — 365-day scan, cap 400/user, feeds same builders | **🟠 HIGH** |
| `memoryExtractionWorker` | started at boot | (internal) | — | Moderate — per-message extraction | 🟡 Medium |
| `registerSyncJob` | interval | — | — | Low | 🟢 Low |
| `continuityEngineJob` | daily 03:00 | — | — | Low–Med | 🟡 Medium |
| `accessibilityDecayJob` | daily 02:00 | — | — | Low | 🟢 Low |
| `arcStabilityDecayJob` | daily 03:30 | — | — | Low | 🟢 Low |
| Engine scheduler | daily 02:00 (`DISABLE_ENGINE_SCHEDULER` gate) | — | — | Med | 🟡 Medium |
| Experimental jobs (insight/graphUpdate/valueEvolution/evolveRelationships/episodicClosure/strategy/enrichment) | gated behind `ENABLE_EXPERIMENTAL_RUNTIME` | — | — | varies | ⚪ Not running (flag off) |
| ~15 domain workers (decision/social/dreams/health/eq/habit/…) | only via engine scheduler/experimental | — | — | varies | ⚪ Mostly dormant |

## Key observations
- **Only the GroupDetectionWorker is both heavy and frequent** (15-min cycle + 6-h society + boot backfill). It is the single CRITICAL memory risk and the only worker that reads *whole history* and builds *quadratic* structures. Everything else is daily/dormant or bounded.
- **Concurrency is "2 users" at the batch level** ([groupDetectionWorker.ts:25](../apps/server/src/workers/groupDetectionWorker.ts)) — but the memory blow-up is **per-user within one run** (the O(n²) graph), so user-level concurrency does not bound it.
- **No per-run memory budget or cap on graph node count** — the builders grow until the heap is exhausted.
- **Caches are process-lifetime singletons** with no eviction (`societyResolver.cache`, `characterNameCache`, `rejectionCache`) → the baseline heap ratchets up every cycle.
- **No graceful backpressure** when OpenAI 429s — the society resolver keeps being invoked across clusters while requests hang.

## Footprint ranking
1. GroupDetectionWorker (society > cycle > backfill) — **the OOM.**
2. Engine scheduler / continuity job — moderate, daily.
3. Everything else — low or dormant.

## Bottom line
This is a **one-worker problem.** Disabling `GroupDetectionWorker` removes the CRITICAL memory risk entirely with zero user-facing impact (group detection is a background enrichment, not a request-path feature).

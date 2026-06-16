# OOM Root Cause Report

Date: 2026-06-16 · Evidence from code paths, not theories. The backend reaches ~4 GB and dies shortly after `group-detection:cycle` / `group-detection:society` runs. This OOM crash-loop is also the cause of the `ECONNREFUSED 127.0.0.1:4000` (the process dies before/while serving).

## The trigger
`GroupDetectionWorker` ([workers/groupDetectionWorker.ts](../apps/server/src/workers/groupDetectionWorker.ts)) runs two heavy passes over **each active user**:
- `runBatch('cycle')` every 15 min → `runForUser` → `groupCandidateService.processConversation` per session.
- `runSocietyBatch()` every 6 h → `societyMappingService.mapUser` which, per its own comment, "reads each user's **WHOLE history**."

Both feed in-memory graph/cluster builders. The data *fetched* is capped (limit 150–400 msgs), so 4 GB is **not** raw row volume — it is **algorithmic expansion + unbounded retention**.

## Phase 4 — the structures that can realistically reach 4 GB (ranked)

### 1. Co-occurrence graph — O(nodes²) edges over noisy nodes  ⭐ primary
[`society/coOccurrenceGraph.ts`](../apps/server/src/services/society/coOccurrenceGraph.ts) `addContext(ids, contextId)` builds **every pair** among `ids` (nested `i,j` loop) and stores, per edge, a `contexts: Set<string>`. Edges = O(nodes²).
- Node identity comes from name extraction that is **noisy by design**: `shouldScanContent` admits any text with `capitalizedMentions.length >= 2` ([groupDetectionWorker.ts:154](../apps/server/src/workers/groupDetectionWorker.ts)). Every capitalized phrase can become a "person" node.
- Over a whole-history pass, junk nodes accumulate → edges explode quadratically → the `edges` Map + per-edge `contexts` Sets balloon **within a single run**. This matches "grows fast, dies shortly after the cycle starts."

### 2. Org-graph fan-out — entire org subgraph materialized at once  ⭐ secondary
[`organizationService.ts:1164`](../apps/server/src/services/organizationService.ts) `Promise.all(orgIds.map(id => getOrganization(userId, id)))` loads **all** orgs in parallel, and each `getOrganization` does `Promise.all([members, stories, events, locations])` ([235](../apps/server/src/services/organizationService.ts), [317](../apps/server/src/services/organizationService.ts)). This materializes **every org with all its members + stories + events + locations simultaneously** — exactly the fetch list in the report. Reached via `reconcileUserOrganizations` (called per conversation) and `groupAnalyticsService`.

### 3. Unbounded singleton resolver cache — slow leak across the process  ⭐ contributing
[`society/societyResolver.ts:49`](../apps/server/src/services/society/societyResolver.ts) `private cache = new Map<string, Resolution>()` on the **module singleton** (`export const societyResolver` line 175). **No max size, no eviction, no clear** — `cache.set` only ever grows. Every society run adds entries; they persist for the whole process lifetime. Plus `groupDetectionService.characterNameCache` and `groupCandidateService.rejectionCache` — same unbounded-singleton pattern. These don't cause a single-run spike but raise the floor every cycle until a heavy run tips it over.

## What is retained / grows unbounded
- **Retained across cycles (leak):** `societyResolver.cache`, `groupDetectionService.characterNameCache`, `groupCandidateService.rejectionCache` — singleton Maps, never evicted.
- **Grows unbounded within a run:** the co-occurrence `edges` Map (O(nodes²)) + per-edge `contexts` Sets; the org fan-out's simultaneous member/story/event/location arrays.
- **Unresolved promises pile up:** under the OpenAI 429 storm (`societyResolver.callModel`), requests hang (`HeadersTimeoutError`) while the graph build keeps allocating — retries (`maxRetries: 2`) and in-flight response buffers add to the heap (see `runtime-stability-report.md`).

## Root cause (one sentence)
The group-detection/society subsystem builds **quadratic-in-noisy-nodes co-occurrence graphs and wide org-subgraph fan-outs over each user's whole history**, on top of **never-evicted singleton caches** — and a heavy run allocates faster than GC can reclaim, climbing to the ~4 GB heap ceiling and crashing Node (which takes the HTTP server down → `ECONNREFUSED`).

## Why now
The schema-drift fix added `organizations.importance_score`, `entity_facts.metadata`, etc. Queries that previously **errored and returned empty** (so the graph/org builders processed nothing) may now **return full data**, feeding the quadratic builders real volume for the first time. Worth confirming with a heap snapshot, but the structural defects above exist regardless.

## Confirmation step (optional)
Run with `node --max-old-space-size` lowered + `--heapsnapshot-near-heap-limit=1`, trigger one society run, and inspect the snapshot — expect the dominant retainers to be `CoOccurrenceGraph.edges` / `Edge.contexts` Sets and/or `SocietyResolver.cache`.

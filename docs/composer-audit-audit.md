# Composer Audit — Audit

Date: 2026-06-16 · Verifies Composer's claimed sprints against **code paths, imports, routes, tables, and runtime** — not docs, reports, or TODOs. Evidence = grep of importers/callers, `routeRegistry` mounts, Supabase schema, measured scorecard.

## Phase 1 — Claim Verification

| Sprint / claim | Evidence checked | Actual state | Verdict |
|---|---|---|---|
| **Stability Sprint** | `lib/semaphore.ts`, `lib/openai.ts` concurrency added (commit 0a7a43f) | Real infra exists; OpenAI client wraps concurrency. But **no global rate limiter** and 429s still fire (Railway logs). | **PARTIALLY TRUE** |
| **Entity Integrity Sprint** | `entityClassifier` (canonical ontology), `entityPollutionRepair.ts` (commit cd2a727) | `entityClassifier` is **LIVE** (referenced across many services, used in resolution). `entityPollutionRepair` is imported **only by `diagnostics.ts:598`** — manual endpoint, **not** on any automatic ingestion path. | **PARTIALLY TRUE** (classifier live; repair manual-only) |
| **Timeline Consolidation Audit** | `timeline`, `timeline-v2`, `timeline-hierarchy` routers; chronology services | Routers **mounted** (`routeRegistry` 459–490); `timelineV2.ts` has real handlers (3). The "consolidation" is largely **docs**; episode-based consolidation core is **dead** (below). | **PARTIALLY TRUE** (timeline runs; consolidation = docs) |
| **Life Reconstruction Recovery** | `relationshipFoundationService`, `eventRecoveryService`; scorecard | Services **real and produce data** — measured scorecard **66/100**, relationshipCount 21, timeline benchmark 8/8. **But** they ran **batch/script + diagnostics only** until wired live this session (commit 883d947, `graphRecoveryTrigger`). | **TRUE (as scripts); was UNWIRED to live** |
| **Timeline UX Work** | `components/timeline/*`, `timeline-v2`, `chronology`, hooks | UI components exist; hooks (`useChronology`, `useTimelineV2`, `useStitchedTimeline`) call **real APIs** (`fetchChronology` → `/api/timeline-v2`). `TimelineStitchedView` + `stitchedTimelineService` real. | **TRUE** |
| **Thread Durability Work** | `threadDurabilityChecks.ts`, `threadRecoveryService.ts` (commit 61388fd) | Both imported **only by `diagnostics.ts`** — manual recovery endpoints, **not automatic**. Thread **summaries** (`threadSummaryService`) + **delete-guard** (RESTRICT + 409) **are** live. | **PARTIALLY TRUE** (recovery manual; summaries+guard live) |
| **Graph Recovery Wiring** | `graphRecoveryTrigger.ts` + ingest hook | The recovery services were **batch-only** when Composer left them. The **live wiring** (debounced per-message trigger) landed in commit **883d947 this session**, not Composer's. | **FALSE for Composer; TRUE now (different author)** |
| **Episode Intelligence (consolidating cores)** | `episodeSegmentationCore.ts`, `entityResolutionCore.ts` (commit ad9fd1d) | **ZERO non-test callers.** Built, tested, doc'd — **never wired**. No `episodes` table. | **DEAD CODE / DOCS ONLY** |

## Phase 5 — Thread System Validation

| Capability | Evidence | State |
|---|---|---|
| **Thread summaries** | `threadSummaryService` called in `ingestionPipelineClass` + `threadIntelligenceService` | **IMPLEMENTED / live** (staleness-gated) |
| **Thread intelligence** | `threadIntelligenceService.updateOnMessage` live at ingest | **PARTIAL** — only `people`/`places`/summaries fed; `projects`/`episodes`/`open_loops` slots **unfed** |
| **Continuity cards** | `buildContinuityCard` renders threadMeta | **IMPLEMENTED** but shows blanks for the 3 unfed fields |
| **Ordering** | `lib/timelineSort.ts` (+ test) | **IMPLEMENTED** |
| **Durability** | delete-guard (`conversationCentered` 409 + `entity_conversation_links` RESTRICT) | **IMPLEMENTED / live** |
| **Recovery/hydration** | `threadRecoveryService`, `threadDurabilityChecks` | **MANUAL ONLY** (diagnostics endpoints; not automatic) |
| **`chat_messages` source-of-truth** | ingest maps chat→conversation messages; thread delete removes both | **IMPLEMENTED** |

## Net read
Composer's work is **mostly real but over-claimed on "wiring."** The pattern: services are built, tested, and committed, then exposed **via diagnostics endpoints or scripts** rather than the live runtime — which a doc/TODO reads as "done" but a code-path audit reads as "manual-only." The one outright **fake-progress** item is the Episode Intelligence cores (dead). Timeline UX and the entity classifier are the cleanest genuinely-live wins.

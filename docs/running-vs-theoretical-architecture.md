# Running vs Theoretical Architecture

Date: 2026-06-16 · Audit only. This describes the **actually-running** architecture (verified by routes mounted, imports, live call paths) — not the planned or intended one.

## What actually runs on the live chat path
```
chat message
  → ingestionPipelineClass.ingestMessageCore   [LIVE]
      → normalize → split → hybridExtractor → extracted_units
      → omegaMemoryService.resolveEntities      [LIVE entity resolution]
      → entityClassifier (canonical ontology)   [LIVE]
      → knowledgeTypeEngine, semanticConversion → journal_entries / memories
      → entityRelationship/attribute detectors  [LIVE, conditional]
      → threadIntelligenceService.updateOnMessage [LIVE: people/places/summaries only]
      → graphRecoveryTrigger.schedule           [LIVE: debounced relationship+event recovery]
  → ragBuilderService → workingMemoryAssembler  [LIVE retrieval, every turn]
```

## What runs only on demand (diagnostics / scripts) — NOT automatic
```
/api/diagnostics →  entityPollutionRepair        [manual]
                    threadRecoveryService          [manual]
                    threadDurabilityChecks         [manual]
                    memoryCoverageAudit            [manual]
                    graphRecoveryTrigger.runNow    [manual force]
scripts/        →  recoverEvents.ts, generateRelationships.ts, lifeReconstructionScore.ts
```

## What is mounted and serving (verified routes)
- **Timeline:** `/api/timeline`, `/api/timeline-v2`, `/api/timeline-hierarchy`, `/api/chronology` — all mounted, real handlers. Frontend hooks (`useChronology`, `useTimelineV2`, `useStitchedTimeline`) call them. **RUNNING.**
- **Subscriptions:** `/api/subscription/*` live; checkout wired (this session). **RUNNING** (pending prod env).
- **~80 route namespaces** mounted in `routeRegistry` — many engine routes (`/api/rpg`, `/api/social-projection`, etc.) have unknown frontend usage (route-usage audit deferred).

## What exists but does NOT run (theoretical)
- **Episode layer:** `episodeSegmentationCore` built, **no `episodes` table, zero callers**. The "Moments" UX is theoretical. Timeline is **event-based**, not scene/episode-based.
- **`entityResolutionCore`:** theoretical alternative resolver; the live path uses `omegaMemoryService` + `entityResolutionService`.
- **`threadIntelligence` projects/episodes/open_loops:** rendered, never populated.

## Data layer truth (verified against live DB)
- RLS enabled on every table (keys on `auth.uid() = user_id`), but **the backend uses the service-role key** → the real authorization boundary is the Express auth middleware + per-query `user_id` filters, not RLS.
- 5 tables RLS-on/no-policy = **backend-service-role-only** (`character_memories`, `character_relationships`, `memoir_outlines`, `memory_components`, `original_documents`).
- Schema drift (7 columns) that threw live errors is **now fixed** (migration applied this session).

## One-paragraph summary
The running architecture is a **single Express monolith** (Railway) over **Supabase Postgres**, with a **per-message ingestion pipeline** that resolves entities, extracts knowledge, updates thread intelligence, and (now) triggers debounced relationship/event graph recovery; a **per-turn retrieval assembler** (`workingMemoryAssembler`); a **mounted timeline/chronology stack** that genuinely serves the UI; and a **large surface of manual recovery/diagnostics tools** that are real but not automatic. The **episode/Moments layer and the alternate resolver core are designed but not running.** Frontend is a Vite/React SPA on Vercel proxying `/api` to Railway.

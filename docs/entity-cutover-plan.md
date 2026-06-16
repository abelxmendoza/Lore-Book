# Entity Resolution Cutover Plan

Date: 2026-06-16 · Plan only (no implementation). Goal: collapse the scattered resolvers into the audited `entityResolutionCore` without behavior regressions.

## Current resolver landscape (live)
| Path | Where | Role |
|---|---|---|
| `omegaMemoryService.resolveEntities` | 7 callers (ingestion, `unifiedErIngestion`, `semanticConversion`, compiler×3, orchestration) | **Primary live resolver** — extract + resolve from text |
| `entityResolutionService` | routes/characters, entityAmbiguity, documentService, … | Secondary resolution + ambiguity |
| `characterRegistry.classifyForCreation` | characters route, characterRegistry | Character creation gate |
| `characterFoundationService.promoteOmegaEntityToCharacter` | ingestion, memoryService | Promotion path (omega → character) |
| `entityRegistry` | ingestion, lifecycle diagnostics | Façade over 4 entity tables |
| **`entityResolutionCore.resolveMention`** | **0 callers (dead)** | **Cutover target** — lore-aware, context-aware, confidence-tiered |

**Problem:** 5+ resolution code paths with different dedup/alias logic → inconsistent "is this a new entity?" decisions (the duplicate-entity + "wrong Juan" bugs).

## Why `entityResolutionCore` is the right brain
It already implements what the others do piecemeal, deterministically and testably: exact/alias/kinship lexical match, **context-aware disambiguation** (thread co-occurrence, relationship overlap, recency, importance), and **confidence tiers** (`auto_resolve` / `merge_suggestion` / `create_separate` / `skip`). It is a *decision core*, not a data layer — it ranks candidates you supply; it does not query the DB. That makes cutover low-risk: callers keep their data access, and route the *decision* through the core.

## Cutover strategy (per path)
The core needs `candidates: ResolutionCandidate[]` + `context`. Each call site already loads candidates; the change is to call `resolveMention(mention, candidates, ctx)` and honor its `action`/`recommendation` instead of bespoke matching.

| Path | Cutover |
|---|---|
| `omegaMemoryService.resolveEntities` | After candidate fetch, replace the internal match/create decision with `resolveMention`. Highest impact (7 callers inherit it). **Do first.** |
| `characterFoundationService.promote*` | Gate promotion on `wouldCreateCharacter()` — prevents creating a duplicate character when a high-confidence existing one exists (the lore-aware guard). |
| `entityResolutionService` / `characterRegistry.classifyForCreation` | Route their classify+match through the core; keep their DB I/O. |
| Document + chat ingestion | Inherit automatically via `omegaMemoryService` (no direct change). |

## Feature-flag strategy
- Add `ENTITY_RESOLUTION_CORE=shadow|on|off` (env, default `shadow`).
- **`shadow`:** run the core alongside the live resolver, **log disagreements** (core says resolve-to-existing vs live says create-new) without changing behavior. Collect for N days.
- **`on`:** the core's decision is authoritative.
- **`off`:** instant rollback to legacy.
- Wrap in one module (`resolveWithCore(mention, candidates, ctx, { shadow })`) so all call sites share the flag.

## Rollback strategy
- Flag flip to `off` (no deploy).
- Because the core only *decides* (doesn't write), shadow mode is side-effect-free — a disagreement log, not a data mutation. Safe to run in prod immediately.
- Keep legacy code paths until the disagreement rate is understood and acceptable.

## Expected improvements (measure in shadow)
- **Duplicate prevention:** fewer near-duplicate characters/entities (kinship + alias + first-name match before create).
- **Alias resolution:** "grandma" → existing "Abuela".
- **Kinship resolution:** role-equivalent matching across languages (tío/uncle).
- **Context-aware disambiguation:** correct "Juan" by thread/relationship context instead of string distance.

## Sequence
1. Build the `resolveWithCore` wrapper + `shadow` flag.
2. Wire `omegaMemoryService.resolveEntities` first → collect disagreement logs.
3. Review disagreements; tune thresholds (`HIGH_CONFIDENCE`, `DISAMBIGUATION_MARGIN`) if needed.
4. Flip to `on` for `omegaMemoryService`; then the promotion + character-creation gates.
5. Delete the bespoke matching logic in the legacy resolvers once `on` is stable.

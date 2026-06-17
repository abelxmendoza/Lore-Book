# Entity Resolution Deletion Plan

**Date:** 2026-06-16  
**Prerequisite:** `ENTITY_RESOLUTION_CORE=on` stable for 7+ days with acceptable disagreement rate

---

## Target Architecture

```
Text mention
    → extract entities
    → load candidates (omega_entities / characters)
    → EntityResolutionCore.resolveMention()   ← ONE decision brain
    → persist (create / link / alias)
```

Keep: **core + classifier + cache + candidate index**  
Delete or merge: **5 bespoke scoring paths**

---

## Systems to Delete or Merge

### Priority 1 — After omega cutover stable

| System | Path | Disposition | Rationale |
|--------|------|-------------|-----------|
| JW-only pool matcher | `omegaMemoryService.resolveEntities` inline logic | **MERGED → bridge** | Replaced by `findLegacyPoolMatch` + core; delete when `off` mode retired |
| Legacy bridge | `entityResolutionBridge.findLegacyPoolMatch` | **DELETE after 30d on** | Rollback path no longer needed |

### Priority 2 — Character creation gates

| System | Path | Disposition | Rationale |
|--------|------|-------------|-----------|
| `characterRegistry.classifyForCreation` | `characterRegistry.ts` | **MERGE → core** | Replace JW matching with `wouldCreateCharacter()` |
| `characterFoundationService.promote*` gates | `characterFoundationService.ts` | **MERGE → core** | Use `resolveMention` before promotion |

Call sites (6):
- `routes/characters.ts`
- `characterFoundationService.ts` (×2)
- `characterNicknameService.ts`
- `documentService.ts`

### Priority 3 — Secondary resolvers

| System | Path | Disposition | Rationale |
|--------|------|-------------|-----------|
| `entityResolutionService.ts` | `services/entityResolutionService.ts` | **MERGE → core** | Fold candidate loading; delete bespoke scoring (~960 lines) |
| `entityResolver.ts` | `services/entities/entityResolver.ts` | **DELETE** | Engine-runtime duplicate detector; superseded |
| `EntityRegistry` | `entityRegistry/` | **MERGE or DELETE** | Keep only if persistence layer; remove matching logic |
| `DuplicateDetector` | `entities/duplicateDetector.ts` | **DELETE** | JW/normalizer duplicate of core |

### Keep (not resolvers)

| System | Path | Role |
|--------|------|------|
| `entityResolutionCore.ts` | `entities/` | **Authority** |
| `entityClassifier.ts` | `entities/` | Type oracle |
| `entityResolutionCache.ts` | `services/` | Candidate cache (not a second brain) |
| `entityResolutionBridge.ts` | `entities/` | Flag + shadow (delete after stable) |
| `certifiedEntityIndexService.ts` | `services/` | Candidate index source |

---

## Duplicate Logic to Remove

| Pattern | Locations | Replacement |
|---------|-----------|-------------|
| Jaro-Winkler name scoring | `omegaMemoryService`, `entityResolutionService`, `findEntityByNameOrAlias` | Core lexical + context ranking |
| Inline alias registration heuristics | `omegaMemoryService.registerAliasIfNew` | Keep (persistence); decision from core |
| `classifyForCreation` JW gate | `characterRegistry` | `wouldCreateCharacter()` |
| Engine `entityResolution` | `engineRegistry.ts` → `EntityResolver` | Route to core or remove engine |
| Normalizer + duplicate detector loop | `entityResolver.ts` | Delete |

---

## Deletion Sequence

```
Week 1–2: ENTITY_RESOLUTION_CORE=shadow (collect logs)
Week 3:   Flip to on in staging
Week 4:   Flip to on in production
Week 5:   Merge characterRegistry + entityResolutionService → core
Week 6:   Delete entityResolver.ts + DuplicateDetector
Week 7:   Remove legacy bridge + off mode
Week 8:   Delete entityResolutionService bespoke scoring
```

---

## Files Safe to Delete (post-stable)

| File | Lines (approx) | Blocked by |
|------|----------------|------------|
| `entities/entityResolver.ts` | ~127 | Engine registry reference |
| `entities/duplicateDetector.ts` | TBD | entityResolver only |
| `entityResolutionService.ts` scoring sections | ~400 | Route callers to core |
| Legacy JW block in `omegaMemoryService` | ~80 | Bridge retirement |

**Do not delete yet:**
- `findEntityByNameOrAlias` — semantic embedding fallback still needed for non-lexical matches
- `entityResolutionCache` — performance cache layer

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Regression on alias matching | 39 unit tests + 11 variant battery |
| Wrong Juan disambiguation | Thread context param; merge_suggestion tier |
| Rollback needed | `ENTITY_RESOLUTION_CORE=off` instant |
| Data corruption | Core decides only; no schema changes |

---

## Verification Before Each Deletion

1. `npm test -- tests/services/entityResolutionBridge.test.ts tests/services/episodeIntelligence.test.ts`
2. `npx tsx scripts/entityResolutionDuplicateAnalysis.ts`
3. `RECOVERY_USER_ID=<uuid> npx tsx src/scripts/lifeReconstructionScore.ts`
4. Shadow disagreement rate < 5% for 7 days

---

## Estimated Code Reduction

| Area | Lines removed (projected) |
|------|---------------------------|
| entityResolutionService scoring | ~400 |
| entityResolver + duplicateDetector | ~300 |
| characterRegistry matching | ~150 |
| omegaMemoryService inline JW | ~80 |
| **Total** | **~930 lines** |

Net: **6 resolution paths → 1 core + thin adapters**

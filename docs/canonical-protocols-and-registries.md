# Canonical Protocols & Registries

**Status:** Engineering spec · **Date:** 2026-06-18  
**Scope:** Unify how Lorekeeper *decides* (protocols) and *indexes* (registries). No new meta-framework. Consolidate what exists.

**One-line thesis:** Five protocols govern every mutation and retrieval; five registries are the only front doors into fragmented storage — everything else routes through them or gets deleted.

---

## 0. Rules of the road

| Rule | Meaning |
|------|---------|
| **Protocols are code, not docs** | Enforced in services with tests; not prompt conventions |
| **Registries index, they don't duplicate** | A registry row points at an existing table row |
| **Chat reflects protocol outcomes** | Assistant wording follows create/merge/defer/revise decisions |
| **No 7th resolver** | All entity decisions → `entityResolutionCore` via `entityResolutionBridge` |
| **No new registry per subsystem** | Timeline/memory/biography do not get their own registry until store consolidation |

---

## 1. Canonical protocols (5)

### P1 — Creation protocol

**Question answered:** "Is this mention new, a match, ambiguous, or junk?"

| | |
|---|---|
| **Authority** | `entityResolutionCore.resolveMention()` |
| **Bridge / flag** | `entityResolutionBridge.resolveWithCore()` · `ENTITY_RESOLUTION_CORE=shadow\|on\|off` |
| **Config** | `apps/server/src/services/entities/entityResolutionConfig.ts` |
| **Choke point (characters)** | `characterRegistry.classifyForCreation()` — **must delegate matching to core; keep locking + defer UI only** |
| **Primary data path** | `omegaMemoryService.resolveEntities()` — **already calls bridge** (shadow by default) |
| **Promotion gate** | `characterFoundationService.promote*` — must call `wouldCreateCharacter()` before insert |

**Decision surface (production):**

```
resolve  → use existing entity (auto_resolve)
defer    → disambiguate / merge_suggestion (surface entity_questions)
create   → create_separate (insert only after gates pass)
skip     → reject junk / non-person
```

**Wiring status**

| Call site | File | Status |
|-----------|------|--------|
| Omega resolve | `omegaMemoryService.ts` (~L356) | ✅ bridge wired; default `shadow` |
| Character create | `characterRegistry.ts` `classifyForCreation` | ❌ still JW-primary |
| Character route | `routes/characters.ts` (~L563) | ❌ calls registry directly |
| Document import | `documentService.ts` (~L272) | ❌ calls registry directly |
| Promotion | `characterFoundationService.ts` (~L192, L500) | ❌ calls registry directly |
| Nickname / restore | `characterNicknameService.ts`, `characterRestoreService.ts` | ❌ calls registry directly |

**Chat emission (required):** Turn metadata must carry `creationOutcome: { action, entityId?, candidates? }` so `omegaChatService` / stream handler can say "started a record" vs "is this the same Juan?" — see `docs/lorebook-v2-architecture.md` RC-3.

---

### P2 — Revision protocol

**Question answered:** "How may this artifact's truth state change?"

| | |
|---|---|
| **Authority** | `CorrectionAuthority.applyRevision()` |
| **Transition graph** | `apps/server/src/services/provenance/CorrectionAuthority.ts` `VALID_TRANSITIONS` |
| **Audit log** | `cognition_mutations` table |
| **Types** | `apps/server/src/services/provenance/types.ts` `ArtifactType`, `TruthState` |
| **API** | `POST /api/identity/revise/:artifactId` → `routes/identity.ts` |

**Wiring status**

| Artifact type | Table mapped | Status |
|---------------|--------------|--------|
| `journal_entry` | `journal_entries` | ✅ |
| `entry_ir` | `entry_ir` | ✅ |
| `knowledge_unit` | `knowledge_units` | ✅ |
| `utterance` | `utterances` | ✅ |
| `entity` | `entities` | ✅ |
| `insight` | `insights` | ✅ |
| `conversation_message` | — | ❌ not in `ARTIFACT_TABLE` |
| `extracted_unit` | — | ❌ |
| `omega_claim` | — | ❌ |
| `character` (user-facing) | `characters` | ❌ revisions go through ad-hoc paths |

**Extend `ARTIFACT_TABLE` for:** `omega_claim` → `omega_claims`, `extracted_unit` → `extracted_units`. Map `character` revisions through `characters.metadata.truth_state` (same pattern as journal entries).

---

### P3 — Retrieval protocol (Sensemaking Contract Layer)

**Question answered:** "What memory may this consumer see, and how must it be labeled?"

| | |
|---|---|
| **Contracts** | `apps/server/src/contracts/sensemakingContract.ts` — `ARCHIVIST`, `ANALYST`, `REFLECTOR` (+ `getContract()`) |
| **Enforcer** | `apps/server/src/contracts/contractEnforcer.ts` |
| **Resolver** | `apps/server/src/contracts/contractResolver.ts` |
| **Persona binding** | `apps/server/src/services/personas/personaRegistry.ts` — each persona → `contract` + `evidencePolicy` |
| **Controller** | `apps/server/src/services/personaController.ts` |

**Principle:** *"No system may consume memory without declaring how it interprets truth."* (`contracts/README.md`)

**Wiring status**

| Consumer | File | Status |
|----------|------|--------|
| Persona catalog API | `routes/persona.ts` | ✅ lists contracts |
| Persona → contract map | `personaRegistry.ts` | ✅ defined |
| **Chat hot path** | `workingMemoryAssembler.ts`, `ragBuilderService.ts`, `omegaChatService.ts` | ❌ **no `contractEnforcer` call** |
| Legacy recall | `memoryRecall/recallEngine.ts` | ⚠️ imports `personaController` only |

**Integration point (single choke):** After `assembleWorkingMemory()` in `ragBuilderService.ts`, apply active persona's contract to `WorkingMemoryPacket` items before prompt build. Weight by `truth_state` + `knowledge_type` per `docs/architecture/ASSESSMENT.md`.

---

### P4 — Ingestion protocol

**Question answered:** "How does an external blob become governed memory?"

| Step | Authority | File |
|------|-----------|------|
| 1. Register | `userFileRegistry.registerOrReuse()` | `ingestion/userFileRegistry.ts` |
| 2. Normalize | `fileNormalizer.normalizeDocument()` | `ingestion/fileNormalizer.ts` |
| 3. Process | `documentService.processDocumentFromArtifact()` / `unifiedFileIngestionService` | `documentService.ts`, `unifiedFileIngestionService.ts` |
| 4. Provenance | `userFileRegistry.appendProvenanceLink()` | `userFileRegistry.ts` |
| 5. Entity create | → **P1 Creation protocol** | via `documentService` → `characterRegistry` (needs P1 cutover) |

**Reference architecture:** `docs/file-provenance-architecture.md`

**Wiring status:** ✅ Best-in-class. Use as template for all file/chat ingestion paths.

---

### P5 — Consolidation protocol

**Question answered:** "How do duplicate or mistaken records merge, archive, or delete?"

| Action | Authority today | File |
|--------|-----------------|------|
| Merge (characters) | `characterMergeService.merge()` | `characterMergeService.ts` |
| Merge (omega) | `omegaMemoryService.mergeEntities()` | `omegaMemoryService.ts` |
| Merge (generic entities) | `entityResolutionService.mergeEntities()` | `entityResolutionService.ts` |
| Delete (characters) | `characterDeletionService.deleteCharacter()` | `characterDeletionService.ts` |
| Archive | scattered metadata flags | various |

**Problem:** Three merge implementations, no shared audit shape. UI protocol copy exists in `apps/web/src/components/characters/CharacterMergePanel.tsx` (`protocolCards`) but backend is not unified.

**Target:** One `consolidationProtocol.apply(action, sourceId, targetId, rationale)` that:
1. Writes `cognition_mutations` with `mutation_type: ENTITY_MERGE | ARCHIVE | DELETE`
2. Delegates persistence to domain services (character vs omega) until `nodes` table exists
3. Invalidates derived artifacts (biography, timeline caches) via P6

---

### P6 — Invalidation protocol (derived artifacts)

**Question answered:** "When inputs change, which projections are stale?"

| | |
|---|---|
| **Spec** | `docs/lorebook-v2-architecture.md` Phase 7 §2 |
| **Pattern** | `computed_from_version` / `input_hash` on derived rows; recompute on write hook or flag stale on read |
| **Targets** | biography snapshots, timeline assemblies, `node.salience`, `episode.importance`, lorebook editions |

**Wiring status:** ❌ Design only. Implement after P1–P3; do not block cutover.

---

## 2. Canonical registries (5)

### R1 — `routeRegistry` ✅ KEEP

| | |
|---|---|
| **File** | `apps/server/src/routes/routeRegistry.ts` |
| **Role** | Single mount catalog; CORE / EXPERIMENTAL / ADMIN tiers |
| **Action** | Prune 0-route mounts (`external-hub`, `harmonization` per `experimental-consolidation-roadmap.md`) |

---

### R2 — `entityRegistry` ✅ KEEP (temporary façade)

| | |
|---|---|
| **File** | `apps/server/src/services/entityRegistry/EntityRegistry.ts` |
| **Role** | Read-only resolve across `characters → omega_entities → people_places → entities` |
| **Lifecycle** | Delete when `nodes` table subsumes person/place stores (`docs/graph-migration-plan.md`) |
| **Do not** | Add write/mutation logic here — that belongs in protocols |

---

### R3 — `userFileRegistry` ✅ KEEP (reference implementation)

| | |
|---|---|
| **File** | `apps/server/src/services/ingestion/userFileRegistry.ts` |
| **Table** | `user_files` |
| **Role** | SHA-256 dedup, derived counts, provenance links |
| **Template for** | Future artifact registry indexing pattern |

---

### R4 — `personaRegistry` ✅ KEEP

| | |
|---|---|
| **File** | `apps/server/src/services/personas/personaRegistry.ts` |
| **Role** | Persona id → sensemaking contract → evidence policy |
| **Wire to** | P3 retrieval protocol in `ragBuilderService.ts` |

---

### R5 — `artifactRegistry` 🔜 BUILD (index only)

| | |
|---|---|
| **New file** | `apps/server/src/services/artifactRegistry.ts` (proposed) |
| **Role** | `list(userId, filters)` / `get(id)` / `provenance(id)` over existing tables — **no new storage** |
| **Indexes** | Types from `provenance/types.ts` + `lorebook`, `biography_snapshot`, `user_file`, `character` |
| **Delegates** | Revision → P2; provenance → `provenanceEdgeService`, `CorrectionAuthority.getMutationHistory` |

---

### Registries to prune (not canonical)

| Registry | File | Action |
|----------|------|--------|
| `engineRegistry` (runtime) | `engineRuntime/engineRegistry.ts` | Prune dead engines (~60 per `experimental-inventory.md`) |
| `engineRegistry` (governance) | `engineGovernance/engineRegistry.ts` | Merge catalog with runtime or delete duplicate |
| `manifestRegistry` | `engineManifest/manifestRegistry.ts` | Keep only if manifest sync stays active |
| `characterRegistry` | `characterRegistry.ts` | **Shrink to choke-point shell** — matching logic → P1; defer UI + locks stay |

---

## 3. Ranked implementation sequence

### Sprint A — Trust-critical (P0)

| # | Task | Files to touch | Done when |
|---|------|----------------|-----------|
| A1 | Flip `ENTITY_RESOLUTION_CORE=on` in staging; review shadow disagreement logs | `entityResolutionConfig.ts`, ops env | Disagreement rate acceptable |
| A2 | Route `characterRegistry.classifyForCreation` matching through `resolveWithCore` | `characterRegistry.ts`, `entityResolutionBridge.ts` | Tests pass; JW only as legacy fallback in `off` mode |
| A3 | Gate `characterFoundationService.promote*` with core | `characterFoundationService.ts` | No duplicate promotion when high-confidence match exists |
| A4 | Emit `creationOutcome` in chat turn metadata | `omegaChatService.ts`, ingestion hook | Stream reflects create/defer/merge truth |
| A5 | Extend `CorrectionAuthority` `ARTIFACT_TABLE` for `omega_claim`, `extracted_unit`, `character` | `CorrectionAuthority.ts`, `types.ts` | `/api/identity/revise` works for those types |

### Sprint B — Retrieval honesty (P1)

| # | Task | Files to touch | Done when |
|---|------|----------------|-----------|
| B1 | Wire `contractEnforcer` after WMA in `ragBuilderService.ts` | `ragBuilderService.ts`, `personaRegistry.ts` | Archivist persona cannot see `BELIEF` at low confidence |
| B2 | Add `truth_state` + `knowledge_type` weights to evidence ranking | `workingMemoryAssembler.ts` or `contextScoringService.ts` | `DISPUTED` ranks below `CANONICAL` |
| B3 | Unify merge audit via P5 wrapper | `characterMergeService.ts`, `entityResolutionService.ts` | All merges write `cognition_mutations` |

### Sprint C — Visibility (P2)

| # | Task | Files to touch | Done when |
|---|------|----------------|-----------|
| C1 | Implement `artifactRegistry` (read index) | new `artifactRegistry.ts`, `routes/identity.ts` or `/api/artifacts` | What AI Knows uses one API |
| C2 | Chat artifact emission panel (frontend) | `features/chat/` | User sees durable outputs per turn |
| C3 | `computed_from_version` on biography/timeline projections | biography + timeline services | Stale flag after episode correction |

---

## 4. Deletion targets (after cutover)

Delete only when call-site audit confirms zero production callers. Sequence matters.

| Target | File(s) | Replaced by | Gate |
|--------|---------|-------------|------|
| JW-primary matching in `characterRegistry` | `characterRegistry.ts` (~L170+) | P1 `resolveWithCore` | A2 + `ENTITY_RESOLUTION_CORE=on` stable 7d |
| `entityResolver` class | `entities/entityResolver.ts` | P1 core | Engine registry import removed |
| Bespoke JW in `entityResolutionService` match path | `entityResolutionService.ts` | P1 core | Shadow logs clean |
| `certifiedEntityIndexService` scoring | `entities/certifiedEntityIndexService.ts` | `entityMentionIndexService` + core | Grep = 0 external callers |
| `recallQueryRouter` as primary recall | `chat/recallQueryRouter.ts` | `workingMemoryAssembler` | Per `trust-continuity-consolidation.md` |
| Duplicate merge in `entityResolutionService` | merge method body | P5 consolidation wrapper | B3 complete |
| 0-route registry mounts | `routeRegistry.ts` entries | — | `validateRouteRegistry()` clean |
| `EntityRegistry` façade | `entityRegistry/` | `nodes` + single resolver | Post graph migration only |

**Do not delete yet:** `entityResolutionService` route handlers (dashboard, conflict UI), `characterRegistry` defer/question queue, `omegaMemoryService` data layer.

---

## 5. Explicitly do NOT build

| Proposal | Verdict | Reason |
|----------|---------|--------|
| Generic `ProtocolRegistry` / plugin system | **NO** | 7th abstraction over 6 stores |
| Per-subsystem registries (timeline, memory, biography) | **NO** | Wait for store consolidation |
| Middleware registry | **NO** | Low leverage |
| Chat command registry | **NO** | No product surface yet |
| New `artifacts` table duplicating rows | **NO** | R5 indexes existing tables |

---

## 6. Acceptance tests (add or extend)

| Protocol | Test file (existing or new) |
|----------|----------------------------|
| P1 Creation | `entityResolutionCore.test.ts`, `characterRegistry.test.ts`, `entityResolutionBridge` shadow tests |
| P2 Revision | `CorrectionAuthority` tests + `routes/identity` integration |
| P3 Retrieval | New: `contracts/ragContractIntegration.test.ts` — persona contract filters WMA packet |
| P4 Ingestion | `userFileRegistry` / `fileNormalizer.test.ts` |
| P5 Consolidation | Extend `characterMergeService` tests — asserts `cognition_mutations` row |
| R5 Artifact index | New: `artifactRegistry.test.ts` — list/get/provenance across types |

---

## 7. Environment flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ENTITY_RESOLUTION_CORE` | `shadow` | P1 creation authority (`entityResolutionConfig.ts`) |
| `ENABLE_EXPERIMENTAL_RUNTIME` | `false` | R1 route tier gating |

---

## 8. One-page mental model

```
User input
  → P4 Ingestion (files) or chat persist
  → P1 Creation (resolveMention) ──→ R2 entityRegistry (read)
  → compile → durable rows
  → P3 Retrieval (sensemaking contract) ← R4 personaRegistry
  → model response (must match P1 outcome)
  → P2 Revision (user corrects) / P5 Consolidation (merge/archive/delete)
  → P6 Invalidation (derived artifacts refresh)
  → R5 artifactRegistry (user audit / What AI Knows)
```

**LNC makes memory honest. SCL (P3) makes intelligence honest. Registries make fragmentation survivable until consolidation deletes the façades.**

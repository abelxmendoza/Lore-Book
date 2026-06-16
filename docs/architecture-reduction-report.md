# Architecture Reduction Report

Date: 2026-06-16 · Plan only. KEEP / MERGE / DELETE across the duplicated subsystems. Items I haven't fully usage-verified are marked **REVIEW** (do a call-site audit before acting) — no blind deletes.

## 1. Entity resolvers (5+ paths → 1 brain + data layers)
| System | Disposition | Rationale |
|---|---|---|
| `entityResolutionCore` | **KEEP (promote to brain)** | The decision core; cutover target (see `entity-cutover-plan.md`) |
| `omegaMemoryService.resolveEntities` | **KEEP (data layer)** | Extract + candidate fetch; routes its *decision* through the core |
| `entityResolutionService` | **MERGE → core** | Fold its matching into `resolveMention`; keep only DB I/O |
| `characterRegistry.classifyForCreation` | **MERGE → core** | Creation gate becomes `wouldCreateCharacter()` |
| `characterFoundationService.promote*` | **KEEP, gate with core** | Promotion stays; add the lore-aware dup guard |
| `entityRegistry` (façade) | **KEEP** | Useful read façade over the 4 entity tables |
| `entityResolutionCore` legacy targets named in its header (`entityResolver`, `certifiedEntityIndexService`, peoplePlaces dedup) | **REVIEW → MERGE/DELETE** | Verify live usage; these are the "6 scattered resolvers" the core was meant to absorb |

**Reduction:** ~3–4 bespoke matching implementations collapse into one tested decision function.

## 2. Retrieval paths
| System | Disposition | Rationale |
|---|---|---|
| `ragBuilderService` | **KEEP (orchestrator)** | The retrieval entry point (omegaChat + chatOrchestrator use it) |
| `workingMemoryAssembler` | **KEEP (optimize)** | The structured assembler; see `wma-performance-audit.md` |
| `memoryRetriever`, `contextScoringService`, `relationshipContextBuilder`, `memoryGraphService` | **REVIEW → MERGE** | All consumed around `ragBuilderService`; high overlap risk (entity/relationship/memory fetching). Audit for duplicated queries — likely 2–3 collapse into the assembler |

**Reduction:** consolidate overlapping fetch logic into the assembler; eliminate repeated entity/relationship lookups across helpers.

## 3. Timeline paths (the biggest sprawl)
**~10 services + 4 routes.** Routes: `chronology`, `timeline`, `timelineV2`, `timelineHierarchy`. Services: `chronologyV2/*`, `timelineV2`, `timelineFoundationService`, `timelineManager`, `timelinePageService`, `taskTimelineService`, `timelineInsight/*`, `timelineAssignmentService`, `timeline/*`, `chronology/*`.

| System | Disposition | Rationale |
|---|---|---|
| `timelineV2` route + `chronologyV2/*` + `stitchedTimelineService` | **KEEP** | The live UI path (`useChronology`/`useTimelineV2`/`useStitchedTimeline` call these) |
| `timeline` (v1) route + `timelineManager`, `timelinePageService`, `timelineFoundationService`, `timelineAssignmentService` | **REVIEW → MERGE/DELETE** | Likely superseded by V2; verify the frontend doesn't call `/api/timeline` (v1) before deleting. **Biggest single reduction opportunity.** |
| `timelineHierarchy` route + hooks | **KEEP** | Distinct hierarchy view, live (`useTimelineHierarchy`) |
| `taskTimelineService`, `timelineInsight/*` | **REVIEW** | Feature-specific; confirm usage |

**Reduction:** timeline is the most duplicated area — a V1→V2 cutover + dead-service deletion is the highest-LOC reduction in the codebase. Needs a frontend route-usage audit first.

## 4. Memory paths
| System | Disposition | Rationale |
|---|---|---|
| `omegaMemoryService` | **KEEP** | Core memory/entity service |
| `memoryConsolidationService` (IR → journal_entry) | **KEEP** | Closes the cognition loop |
| `memoryService`, `memoryGraphService`, `memoryRetriever` | **REVIEW → MERGE** | Overlap with omega + retrieval; audit for duplicated reads/writes |
| `semanticConversion`, `knowledgeTypeEngine`, `entryEnrichment` | **REVIEW → MERGE (OpenAI cost)** | Overlapping per-message LLM passes over the same text (see `openai-cost-audit.md`) — consolidation cuts both code and OpenAI spend |

## 5. Dead code (confirmed earlier — safe delete now)
- `episodeSegmentationCore` → **KEEP** (now slated for activation, see `episode-readiness-report.md`) — *reclassified from delete*.
- `entityResolutionCore` → **KEEP** (cutover target) — *reclassified from delete*.
- `billing/pricing.ts` → **DELETE** (0 importers) — only remaining true dead file.

## Prioritized reduction sequence (no new features)
1. **Entity cutover** (Phase 1 plan) — collapses 3–4 resolvers → 1 core. Highest correctness + complexity win.
2. **WMA optimization** (Phase 3 plan) — fewer/cheaper queries, no merge risk.
3. **Timeline V1→V2 audit + delete** — largest LOC reduction, but gated on a frontend route-usage check.
4. **Retrieval/memory helper MERGE** — after a usage audit confirms overlap.
5. **Delete `billing/pricing.ts`** — trivial.

## Guardrail
Every MERGE/DELETE here is gated on a **call-site/route-usage audit** — the lesson from the Composer audit is that "looks unused" often means "reachable only via diagnostics or one frontend hook." Verify before deleting. The two safe, high-confidence actions now are the **entity cutover (shadow mode)** and the **WMA query optimization** — neither deletes anything; both reduce duplicate logic and query count.

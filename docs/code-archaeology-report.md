# Code Archaeology Report

Status: Code Archaeology Sprint — master report.
Companions: [dead-code-salvage-report.md](dead-code-salvage-report.md), [activation-candidates.md](activation-candidates.md), [deletion-candidates.md](deletion-candidates.md).

Governing rule: **nothing is deleted for zero references alone.** Each system is judged on what it solves and whether the concept is worth keeping.

## Methodology (and its limits — read this)

Detection = per-file reference scan: for each source file, count importers of its basename across the tree, excluding the file itself and tests. Zero importers ⇒ candidate dead.

**Caveats that shaped the numbers (documented so this is reproducible):**
- macOS BSD `grep`/`sed` bit twice: `\b` word-boundaries silently match nothing (use `[[:<:]]`), and `sed 's/…\(ts\|tsx\)$//'` doesn't strip extensions (no `\|` in BSD BRE). Early scans produced *false* dead lists (flagged `Header.tsx`, `useSubscription.ts` — both heavily used). The final lists use portable `${b%.ts}` stripping and were **calibrated against known-live files** (`Header`→243 importers, `api/timeline`→158) before being trusted.
- This catches *static* import-graph death. It will not catch: dynamic `import()` by constructed string, reflection, or "imported but gated behind a disabled flag" (shadow code). Those are handled case-by-case in the salvage report.
- A proper tool (`knip` / `ts-prune`) should be run in CI to keep this honest going forward — see roadmap.

## Headline numbers

| Surface | Total source files | Verified dead | Notes |
| --- | --- | --- | --- |
| Server `apps/server/src` | 1361 | **48** | clusters, not scatter — see below |
| Web hooks | ~90 | **3** | `useVerification`, `useDebounce`, `useOrchestratorStream` |
| Web api clients | 26 | **0** | api layer is fully wired |
| Web components | ~400 | **~40** | mostly unmounted feature surfaces |
| Routes | 151 routers | 0 unmounted | but **90 EXPERIMENTAL + 3 RESEARCH** gated off (`ENABLE_EXPERIMENTAL_RUNTIME=false`) |

The frontend is **much healthier than feared** (3 dead hooks, 0 dead api clients). The dead mass is server-side and **clusters into whole subsystems**, which is the good case — subsystems are easy to reason about as units.

## Dead server code, by cluster

| Cluster | Files | What it is | Disposition (Phase 3) |
| --- | --- | --- | --- |
| **Domain workers** | 19 | dreams, decision, learning, creative, social, financial, goal, time, wisdom, values, habit, eq, growth, influence, intervention, resilience, chronology, legacy, health — thin wrappers over per-domain engines (Life-OS vision) | **ARCHIVE** (gated experimental) |
| **Paracosm** | 5 | imaginary-world modeling (classifier/extractor/graphBuilder/scoring/storage) | **ARCHIVE** |
| **RPG** | 3 | `rpgProcessor` + `discoverySystem` + `reflectionPrompts` (orchestrates companion/faction/skillTree/quest engines) | **ACTIVATE-partial** (quests already live) |
| **Memory/recall** | 5 | `recallEngine` (444L), `lifeArcService` (539L), `experienceClusterer` (258L), `llmMemoryExtraction`, `batchProcessor` | **MERGE** |
| **Compiler/contracts** | 5 | `contractEnforcer`, `contractAwareMemoryRetriever`, `canonService`, `incrementalCompiler`, classification test-data | **KEEP** (governance) / **DELETE** (fixture) |
| **Shadow cores** | 2 | `entityResolutionCore` (imported, gated), `episodeSegmentationCore` | **ACTIVATE** |
| **Misc services** | ~6 | `storyInsightService`, `continuity/resolutionService`, `threads/threadAssignmentService`, `will/llmRules`, `rag/semanticChunker`, `activeLearning/modelFineTuner`, `ingestion/eventPostProcessor` | mixed (see salvage) |
| **Infra/ops** | 4 | `engine/PriorityQueue`, `lib/founderGuard`, `jobs/runEmbeddingReindex`, `jobs/recommendationJob` | **KEEP** (infra/ops) / ARCHIVE |

(`entityResolutionCore` is *not* zero-ref — it's imported by `omegaMemoryService` + `entityResolutionBridge` but only for a type and behind shadow wiring; it is functionally inactive. Treated as shadow code, not dead.)

## Dead frontend code, by cluster

| Cluster | Examples | Disposition |
| --- | --- | --- |
| `_future-surfaces/` | DataSourceBadge, MotifHeatmap, EntryList, CorrelationGraph | **ARCHIVE** (self-labeled future) |
| Timeline variants | ImprovedTimelineView, TimelineArcRibbon, TimelineDriftTag, TimelineIdentityPulse, TimelineVoiceMemoMarker, TimelineLayerToggles, TimelineEventsChronology | **DELETE-candidates** (superseded by live timeline-v2) |
| Feature surfaces | memoir (3), github (2), events (3), romantic (2), chronology, relationshipTree, verification, lorebook (4), skills/SkillNetworkView | **ARCHIVE** (unmounted features) |
| Hooks | useVerification, useOrchestratorStream | ARCHIVE; `useDebounce` → **KEEP** (generic) |

## Phase 5 — Architecture value scores

Scored 1–5: **TQ** technical quality · **C** completeness · **R** reuse potential · **BV** business value (now) · **RV** roadmap value. Disposition follows the weighted read, not any single column.

| Component | TQ | C | R | BV | RV | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| `entityResolutionCore` | 5 | 4 | 5 | 4 | 5 | **ACTIVATE** |
| `episodeSegmentationCore` | 5 | 4 | 5 | 3 | 5 | **ACTIVATE** |
| `recallEngine` | 4 | 4 | 4 | 3 | 4 | **MERGE** |
| `lifeArcService` | 4 | 4 | 3 | 3 | 4 | **MERGE** |
| `experienceClusterer` | 4 | 3 | 4 | 2 | 4 | **MERGE** |
| `contractEnforcer` (+contract retriever) | 4 | 3 | 3 | 2 | 4 | **KEEP** |
| RPG subsystem | 3 | 3 | 3 | 3 | 4 | **ACTIVATE-partial** |
| 19 domain workers | 3 | 2 | 3 | 2 | 4 | **ARCHIVE** |
| Paracosm (5) | 3 | 3 | 2 | 1 | 2 | **ARCHIVE** |
| `PriorityQueue`, `useDebounce` | 4 | 5 | 5 | 2 | 3 | **KEEP** |
| `runEmbeddingReindex`, `founderGuard` | 3 | 4 | 3 | 3 | 3 | **KEEP** |
| Timeline component variants | 2 | 2 | 2 | 1 | 1 | **DELETE** |
| `compiler/test-data/classification-samples` | 1 | 1 | 1 | 1 | 1 | **DELETE** |

## Disposition summary

| Disposition | Count (approx) | Meaning |
| --- | --- | --- |
| KEEP | ~5 | live-adjacent infra or frozen governance; leave in place |
| ACTIVATE | ~4 | high-value, wire into the live path |
| MERGE | ~5 | fold logic into a production equivalent, then remove |
| ARCHIVE | ~60 | move to `archive/` namespace; keep history, stop maintaining |
| DELETE | ~10 | superseded duplicates / fixtures — rationale in deletion doc |

## The one-paragraph verdict

This codebase is not rotten — it is **stratified**. The dead mass is overwhelmingly the **Life-OS experimental layer** (domain workers + paracosm + RPG) that was built ahead of activation, plus a few **consolidation cores built but never switched on**. The cores (`entityResolutionCore`, `episodeSegmentationCore`) are the prize: they were written specifically to *reduce* sprawl and are the cheapest high-leverage activation available. The experimental layer should be archived as a unit (not deleted — it encodes the product roadmap), and only superseded UI variants and test fixtures should actually be deleted. Architecture shrinks by **archiving a stratum**, not by hunting individual files.

# Classification Roadmap

Status: Classification Intelligence Sprint — sequencing.
Companions: [classification-audit.md](classification-audit.md) (problem), [dynamic-classification-model.md](dynamic-classification-model.md) (design).

Goal: migrate from four competing vocabularies to one stable root ontology + a dynamic, confidence-gated, user-correctable classification layer — **without a big-bang rewrite and without regressing the anti-pollution fixes** already shipped in `entityClassifier.ts`.

Principle: each milestone is shippable on its own and leaves the system no worse than before.

## Milestone 0 — Freeze & reconcile the canon (no code risk)
- Reconcile `docs/canonical-ontology.md` (16) with `EntityClass` (20): adopt the **18 roots** from the model doc; record the merge decisions (LOCATION→Place, COMPANY→Organization, HOUSEHOLD→Place/dwelling, UNCLASSIFIED→Unknown, character→Person).
- Add a single source-of-truth `ROOT_TYPES` const and make `EntityClass` reference it, so doc and code can never drift again.
- **Exit:** one published root list, referenced by code. No behavior change.

## Milestone 1 — Root type as a first-class column
- Add `root_type` (defaulted `Unknown`) to the entity table(s); backfill from existing types via the merge map.
- Point `entityClassifier` output at `root_type`; make `toOmegaType`/`toLegacyEntityType` *adapters off `root_type`* rather than independent vocabularies (lossy conversion becomes a presentation concern, not a storage one).
- **Exit:** every entity has a stable root; resolution begins joining on it. Legacy columns still written for compatibility.

## Milestone 2 — Classifications table (dynamic layer)
- Ship `classifications` + `classification_id` + `tags[]` (schema in the model doc).
- Seed `proposed` classifications from existing data: lane values, free `relationship_type` strings, life-event `event_type` strings — each becomes a row, deduped via `canonical_id`.
- Read path only at first (display the classification if present); writes still via existing logic.
- **Exit:** the variety that was free-string sprawl is now rows that can be merged and pruned. Hardcoded swimlanes deleted in favor of lane-classifications.

## Milestone 3 — Confidence bands + hard gates
- Implement the four bands (Promote/Review/Hold/Reject) and the two promotion ladders (root, classification).
- Port the existing deterministic anti-pollution rules into explicit **hard gates** evaluated before confidence (PERSON-needs-evidence, company-prefixed-product, lexicon precedence, geographic suffix).
- Gate Character promotion on the Promote band (keeps the shipped `Mention→…→Character` invariant).
- **Exit:** no auto-Character without earned confidence; pollution cases (`Amazon Ring`, `Find My`, `Moreno Valley`) provably blocked by gate tests.

## Milestone 4 — Feedback loop
- Ship `classification_corrections` + `classification_history` (append-only).
- Wire correction UI: re-root an entity, create/select a classification, see the reason.
- Corrections become highest-weight signals and **propose deterministic rules** after N repeats (review queue, not auto-apply).
- **Exit:** users can fix a misclassification and the same mistake stops recurring; every classification answers "why."

## Milestone 5 — Consumer cutover
- Route all live consumers through one `classify()` boundary; resolution keys on `root_type`, classification/tags become match features only.
- Relationship recovery + event recovery (batch) consume classifications instead of free strings; thread intelligence reads lane-classifications.
- Decommission the **dead** `entityResolutionCore` / `episodeSegmentationCore` (do not migrate them); document them as removed.
- Drop legacy entity-type columns once adapters prove stable.
- **Exit:** single vocabulary end-to-end; no per-boundary translation.

## Sequencing notes
- M0–M2 are low-risk and unlock the win (no more sprawl) early.
- M3 protects production (anti-pollution) — must land before any LLM classification is trusted.
- M4 is where accuracy-over-time comes from.
- M5 is cleanup; safe only after adapters (M1) are proven.

## Definition of done (sprint success criteria)
- [ ] **Stable ontology** — 18 roots, governed, code+doc share one source.
- [ ] **Dynamic classifications** — new specificity is a row, never a migration.
- [ ] **Confidence-based promotion** — four bands + two ladders, hard gates enforced.
- [ ] **User-correctable learning** — corrections re-root, create classifications, harden rules, and are fully explainable.
- [ ] **No ontology explosion** — roots fixed; variety lives in prunable, dedup-able rows.

## Explicitly out of scope
- Reviving `entityResolutionCore` / `episodeSegmentationCore` (dead; retire, don't rebuild).
- Internal-life modeling beyond adding the `Concept` root as a landing zone (see `life-graph-ontology.md`).
- Moving non-entity enums that are already clean (`GoalType`, `skill_category`).

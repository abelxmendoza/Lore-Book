# Graph Pollution Report

Status: Entity Integrity Sprint baseline report.

## Executive Summary

LoreBook's highest graph integrity risk was not extraction volume; it was inconsistent type authority. Products, apps, places, and venues could be stored as people, then promoted into Character cards. This sprint adds a shared deterministic classifier, blocks known non-person Character creation, routes document imports through the registry, and requires repeat evidence before automatic promotion.

## Obvious Misclassified Entities

These should not be Characters:

| Mention | Correct Type | Likely Root Cause | Cleanup Action |
| --- | --- | --- | --- |
| High Noons / High Noon | FoodDrink | LLM or legacy extractor treated capitalized product/drink as person. | Retype as `FOOD_DRINK` / platform, remove Character card if present, preserve mentions as product evidence. |
| Amazon Ring | Product | Company-prefixed product was promoted as person. | Retype as `PRODUCT`; link to Amazon if needed. |
| Moreno Valley | Place | Proper noun/location defaulted to person. | Retype as `LOCATION`/`PLACE`; migrate Character evidence to location facts. |
| Find My | App | App name trusted as person. | Retype as `APP`; remove Character projection. |
| Mom's House | Place / Household | Possessive dwelling read as a character-like phrase. | Retype as `HOUSEHOLD`/`LOCATION`; link to Mom only as owner/context if known. |
| Club Metro | Place | Venue phrase can look like a named person/group. | Retype as `LOCATION`. |
| Prayers | Organization / Band | Band name can look like abstract person/card label. | Retype as `ORG`. |
| Ex Lover | Organization / Band | Band name can look like relationship/person phrase. | Retype as `ORG`. |

## Duplicate Risks

| Pair | Expected Handling | Confidence |
| --- | --- | --- |
| Daisy <-> Hell Fairy | Do not auto-merge. Suggest only if alias/evidence confirms same person. | Medium |
| Juan <-> Oscuri.dad | Merge only through exact alias/user confirmation. | Medium-high if alias exists |
| Mom <-> Mother | Strong candidate if both refer to the user's mother; still confirm in ambiguous family contexts. | High |
| Tio Juan <-> Juan | Review required. Kinship prefix means this may be a specific uncle, not every Juan. | Medium |

Implemented support:

- `/api/characters/duplicates` now returns `confidence`, `recommendation`, and `reason`.
- Exact and alias overlaps are high-confidence merge suggestions.
- Containment matches are review-required, with lower confidence for kinship names.
- `entity_questions` remains the gate before ambiguous duplicate creation.

## Orphan Entity Categories

Expected orphan classes to audit in production data:

- `characters` with no `character_memories` and no `metadata.source_entity_id` or `metadata.omega_entity_id`.
- `people_places` with `type = person` but no related entries or only one mention.
- `omega_entities` with type `PERSON`/`CHARACTER` and no claims, relationships, or conversation links.
- `entities` rows with `type = person` created from capitalized-token extraction only.

Cleanup estimate: medium. These rows are likely concentrated around older ingestion paths and recent chat extraction, not every memory.

## Entities Without Evidence

Flag any Character card with:

- `memory_count = 0`.
- Empty `metadata.source_entry_ids`.
- No `character_memories` rows.
- No `entity_facts` rows.
- No origin thread link.

Cleanup action:

1. If classifier says known non-person, demote to the correct entity type.
2. If unknown and single mention, remove Character projection but keep the underlying mention/entity.
3. If person-like but weak, convert to promotion candidate or pending question.

## Entities Without Relationships

Relationship absence is not automatically pollution. It is a trust risk when the card also has weak evidence:

- No relationships + multiple memories: biography should show "mentioned, relationship unknown."
- No relationships + one mention: keep as entity/promotion candidate, not Character.
- Family/kinship names without family edges: queue relationship extraction/backfill before biography generation.

## Cleanup Impact Estimate

Short-term impact:

- Prevents new bad Character cards for the known product/app/place failures.
- Reduces duplicate card growth from chat/doc imports.
- Makes duplicate review clearer by confidence level.

Medium-term impact:

- Existing polluted cards can be demoted without losing raw memory evidence.
- Biography generation becomes more trustworthy because Character cards are less likely to contain apps, places, products, or one-off unknowns.

## Ranked Fix Plan

### P0

1. Enforce `classifyEntity()` as the only type authority before storage and promotion.
2. Block known non-person categories from `characterRegistry.classifyForCreation()`.
3. Require repeat evidence before automatic Character promotion.
4. Route document-imported characters through the registry.

### P1

1. Add a cleanup/backfill script that reclassifies existing Character cards with the deterministic classifier.
2. Demote known non-person cards to `omega_entities`/`people_places` while preserving evidence links.
3. Create promotion-candidate records for weak single-mention people instead of Character cards.
4. Add tests for duplicate cases: Daisy/Hell Fairy, Juan/Oscuri.dad, Mom/Mother, Tio Juan/Juan.

### P2

1. Consolidate entity tables behind a canonical entity registry API.
2. Add first-class `entity_type`, `classification_confidence`, and `classification_reason` columns where schemas allow it.
3. Add evidence coverage diagnostics for every Character card.
4. Build admin tooling for "demote Character to Place/App/Product/Organization."

### P3

1. Migrate to a single canonical entity table with typed projections.
2. Add ontology-driven relationship constraints.
3. Train active-learning corrections from user merge/demote actions.
4. Add graph pollution CI checks for fixtures and migrations.

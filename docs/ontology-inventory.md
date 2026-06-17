# Ontology Inventory (Phase 1)

Status: Ontology, Glossary & Lexical Intelligence Sprint — Phase 1 audit of every taxonomy, now unified under `apps/server/src/services/ontology/`.

Companions: [entity-keyword-glossary.md](entity-keyword-glossary.md) (raw lexicons), [classification-audit.md](classification-audit.md), [dynamic-classification-model.md](dynamic-classification-model.md).

## The unified system (Phases 2–8, shipped)

`apps/server/src/services/ontology/`
- **`glossary.ts`** — keyword source of truth: `{ keyword, aliases, domain, category, subcategory, weight, confidence, relationshipHint, queryHint, titleLeading, generation }`.
- **`ontology.ts`** — canonical hierarchy `ROOT → CATEGORY → SUBCATEGORY → KEYWORDS → ALIASES` built from the glossary; root metadata (`CHARACTER_ELIGIBLE`); `ontologyRows()` for the Explorer UI.
- **`lexicalIntelligence.ts`** — `scoreKinshipInContext` (P4), `discoverEntities` (P5), `discoverRelationshipHints` (P6), `classifyQueryType` (P7), `enrichEntity` (P8).

Verified on real founder examples: Goth Tio/Oscuri.dad → not kin; Tío Juan/Abuela/Step Dad Ben → kin; "Abuela's house" → Abuela[FAMILY] + Abuela's House[LOCATION/DWELLING]; social/family/work/adversarial hints; TEMPORAL/GOAL/PROJECT/COMMUNITY query types.

## Inventory — every taxonomy and where it now maps

| Domain | Source taxonomy (file) | Type / values | Ontology mapping | Dupes / overlaps |
| --- | --- | --- | --- | --- |
| Character filters | `CharacterBook.CharacterCategory` | all, family, friends, romantic, **rivals**, mentors, professional, creative, public_figure, mentioned, direct, indirect, distant, unmet, third_party | PERSON + RELATIONSHIP_VERB hints (FAMILY/SOCIAL/ROMANTIC/MENTOR/WORK/ADVERSARIAL/CREATIVE) | rivals overlaps conflict subsystem; proximity tiers are orthogonal (keep) |
| Relationship types | `entityRelationshipDetector` enum | friend_of, best/close/childhood_friend_of, enemy_of, rival_of, ex_friend_of, mentor/colleague/family | RELATIONSHIP_VERB → RelationshipHint | 3 vocabularies (RelationshipTag / GraphEdgeType / free) — see classification-audit |
| Family / household | `kinshipGlossary`, `familyTreeService` | GRANDMOTHER..SIBLING (+ step/grand/great/half) | PERSON/FAMILY/* with `generation` + `titleLeading` | kinship strings vs FamilyRelationType normalized in familyTreeService |
| Location filters | `LocationBook`, `entityClassifier` (GEO_SUFFIX/VENUE_SUFFIX/PLACES/VENUES) | venue/dwelling/geo kinds | LOCATION/VENUE|DWELLING|OUTDOOR|RETAIL | LOCATION vs PLACE dup (classification-audit) |
| Event filters | events surfaces, `entityClassifier` | party/wedding/show/concert/ceremony | EVENT/SHOW|GATHERING|CEREMONY|WORK_EVENT | life-event vs ContinuityEventType vs payment event_type collision |
| Project filters | `ProjectBook` | active/paused/completed/abandoned (status) | PROJECT/INITIATIVE + queryHint | status axis kept separate from type |
| Goal filters | `goalValueAlignment.GoalType` | PERSONAL/CAREER/RELATIONSHIP/HEALTH/FINANCIAL/CREATIVE | GOAL/OBJECTIVE + queryHint | clean (kept) |
| Skill filters | `skills.skill_category` | professional/creative/physical/social/… | SKILL/CAPABILITY + queryHint | `skill_type` free field dead |
| Quest filters | quest surfaces | quest status/types | (future) map to PROJECT/GOAL hybrids | not yet in glossary |
| Community filters | `organizations`, group_type | scene/band/team/community | GROUP/COMMUNITY|MUSIC_GROUP|TEAM + queryHint | GROUP vs ORGANIZATION vs FAMILY overlap |
| Timeline filters | swimlanes (`autoTaggingService`: life/robotics/mma/work/creative) | hardcoded lanes | → CONCEPT lanes (future, user-extensible) | hardcoded to founder; sprawl risk |
| Apps/Products/Brands/Food | `entityClassifier` Sets | APPS/PRODUCTS/BRANDS/COMPANIES/FOOD_DRINKS | APP/PRODUCT/BRAND/ORGANIZATION/FOODDRINK | anti-Person guards |
| Time | `temporalQueryService` (co-editor) | TODAY/YESTERDAY/THIS_WEEK/… | TIME/* + queryHint TEMPORAL_QUERY | overlaps temporal sprint |

## Duplicates & overlaps (carry-over, tracked elsewhere)
- Entity-type vocabulary fragmentation (4+ stores) — [classification-audit.md](classification-audit.md).
- Relationship-type fragmentation (3 vocabularies).
- LOCATION vs PLACE, GROUP vs ORGANIZATION vs FAMILY boundary fuzziness.
- Timeline swimlanes hardcoded to one user → should become user-extensible CONCEPT lanes.

## Remaining (Phases 9–10, follow-on)
- **Phase 9 — Story intelligence enrichment:** map venue/event/group ontology tags to arcs (Club Metro + First Street Pool + Warehouse Show → Nightlife/Community/Music-Scene arcs). The `enrichEntity` tags + `discoverEntities` are the inputs; wiring into episode/arc synthesis is the next step (coordinate with the active temporal/story work).
- **Phase 10 — Ontology Explorer UI (`/ontology` admin):** `ontologyRows()` already returns the flat browse data (root/category/subcategory/keyword/aliases/confidence/weight/hints/usage). Needs a read-only admin page + a `/api/ontology` route to surface it, plus per-keyword usage counts (join against entity tags once enrichment is persisted).
- **Search index enrichment (Phase 8 wiring):** call `enrichEntity()` at ingestion and persist `ontologyTags`/`relationshipHints` onto entities so search/WMA/recall can filter by them.

## How to extend
Add a keyword to `glossary.ts` (one entry) → it automatically joins the hierarchy, discovery, enrichment, and (once wired) the Explorer UI. The glossary is the single source of truth; everything else derives from it.

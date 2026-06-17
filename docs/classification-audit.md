# Classification Audit

Status: Classification Intelligence Sprint — Phase 1 inventory.
Scope: every place LoreBook assigns a *type* or *category* to a node, and where those vocabularies duplicate, overlap, conflict, or sit unused.

Companion docs: [dynamic-classification-model.md](dynamic-classification-model.md) (the proposed design), [classification-roadmap.md](classification-roadmap.md) (sequencing). Builds on the existing [canonical-ontology.md](canonical-ontology.md), [entity-classification-audit.md](entity-classification-audit.md), [graph-pollution-report.md](graph-pollution-report.md).

## Executive summary

There is no single classification system. There are **at least four competing entity vocabularies**, **three relationship vocabularies**, **two `event_type` namespaces that collide**, and a **swimlane set hardcoded to one user's life** (`robotics`, `mma`). Every pipeline boundary does a lossy translation between vocabularies (`toOmegaType`, `toLegacyEntityType`, `inferType`). The deterministic classifier in `entityClassifier.ts` is good and is the right foundation, but its output type is wider than the documented canon and is immediately down-converted to legacy types at the storage boundary, discarding the precision it just earned.

The disease is **vocabulary fragmentation**, not missing types. The cure is one stable root ontology + a dynamic classification layer on top of it (see the model doc).

## Inventory

### 1. Entity types — FOUR vocabularies

| Vocabulary | Where | Values | Notes |
| --- | --- | --- | --- |
| `EntityClass` | `services/entities/entityClassifier.ts:14` | PERSON, FAMILY, PLACE, LOCATION, HOUSEHOLD, GROUP, ORGANIZATION, COMPANY, PROJECT, PRODUCT, BRAND, APP, SKILL, PET, VEHICLE, MEDIA, FOOD_DRINK, EVENT, UNKNOWN, UNCLASSIFIED (20) | The richest + most correct. Has internal duplicates (see conflicts). |
| Documented canon | `docs/canonical-ontology.md` | Person, Family, Place, Organization, Group, Project, Event, Product, Brand, App, Skill, Pet, Vehicle, Media, FoodDrink, Unknown (16) | Already **drifted** from the code (collapses LOCATION/COMPANY/HOUSEHOLD/UNCLASSIFIED; code did not). |
| `CertifiedEntityType` | `services/entities/certifiedEntityIndexService.ts:9` | character, location, organization, skill, event (5) | Uses **`character`** as a type — but "Character" is a *promotion outcome*, not a type. Conflates lifecycle stage with classification. |
| `EntityType` (legacy) | `services/entities/types.ts:5` | person, place, org, event, thing, unknown (6) | What the extractor emits via `toLegacyEntityType()`. |
| `LegacyOmegaEntityType` | `entityClassifier.ts:191` + `omega_entities.type` | PERSON, LOCATION, ORG, EVENT, PRODUCT, … (uppercase) | Storage target; `toOmegaType()` collapses 20 → ~8. |
| `people_places.type` | DB | person, place | Coarsest; the original sin behind the pollution bugs. |

### 2. Event types — TWO unrelated namespaces sharing one column name

| Vocabulary | Where | Values |
| --- | --- | --- |
| `ContinuityEventType` | `types.ts:601`, `types/continuity.ts:6` | contradiction, abandoned_goal, arc_shift, identity_drift, emotional_transition, thematic_drift, goal_progress, goal_reappearance, behavioral_loop (9) — *narrative/continuity* events, not life events |
| `event_type` (life events) | `types.ts:282`, `events` table | free string, no enum |
| `payment_events.event_type` | billing | payment_succeeded, payment_failed, refund, subscription_created/deleted — **unrelated billing domain colliding on the same column name** |

There is no canonical taxonomy for *life* events (party, wedding, move, job change). They are stored as free strings.

### 3. Timeline categories / swimlanes — hardcoded to one user

| Where | Values |
| --- | --- |
| `services/autoTaggingService.ts:102,118` | `life, robotics, mma, work, creative` — **personalized to the founder's life** (robotics, mma). Default fallback `life`. |
| `timeline.ts:80`, `timelinePageService.ts:25` | `lane: string` — free string, no validation at the API |

This is the clearest **sprawl-and-won't-generalize** finding: lanes are both hardcoded *and* free-string, and the hardcoded set encodes one person's hobbies.

### 4. Relationship types — THREE vocabularies

| Vocabulary | Where | Values |
| --- | --- | --- |
| `RelationshipTag` | `types.ts:42` | friend, family, coach, romantic, professional, other (6) |
| `GraphEdgeType` | `types.ts:551` | semantic, social, thematic, narrative, temporal, emotional, character, location, tag (9) — mixes relationship *semantics* with graph *mechanics* |
| `relationship_type` (free) | `er/writeRelationship.ts:73`, `relationshipFeatures.ts` | LLM-generated free string, unbounded — the sprawl source; also a uniqueness key (`onConflict: …,relationship_type`) so spelling variants fork rows |

### 5. Goal types — single clean enum (good)

`GoalType` (`types/goalValueAlignment.ts:6`): PERSONAL, CAREER, RELATIONSHIP, HEALTH, FINANCIAL, CREATIVE (6). Plus `GoalStatus`, `TargetTimeframe`. This is the model to imitate.

### 6. Skill types — enum + unused free field

`skill_category` (`routes/skills.ts:131`): professional, creative, physical, social, intellectual, emotional, practical, artistic, technical, other (10). `skill_type` exists as an optional **free string that nothing consumes** — dead field.

### 7. Project types — absent

`PROJECT` exists as an entity root, but there is **no project subtype taxonomy**. Projects cannot be filtered or grouped by kind. Missing, not duplicated.

## Cross-cutting findings

### Duplicates
- Inside `EntityClass`: **PLACE vs LOCATION**, **ORGANIZATION vs COMPANY**, **UNKNOWN vs UNCLASSIFIED** — three pairs that mean the same thing.
- `person` (legacy) vs `PERSON` (omega) vs `character` (certified) — same concept, three spellings, three lifecycle meanings.

### Overlap
- **GROUP / FAMILY / HOUSEHOLD / ORGANIZATION** have no crisp boundary (is "the band" a Group or Organization? is "Mom's house" a Place or Household?). The classifier guesses; consumers disagree.
- **RelationshipTag vs GraphEdgeType vs free `relationship_type`** — three answers to "what kind of relationship is this."

### Conflicts
- `CertifiedEntityType.character` treats a **promotion outcome as a type**, contradicting the canonical rule that Person is the type and Character is earned (`canonical-ontology.md` §"Required Promotion Invariant").
- The doc canon (16) and the code enum (20) **disagree today** — documentation drift already happened, which is exactly what an ontology must not do.
- Every boundary down-converts (`toOmegaType` 20→8, `toLegacyEntityType` →6, `inferType`→2), so a precise classification is **lossily flattened the moment it is stored**.

### Unused / dead
- `skill_type` free field (nothing reads it).
- `event_type` for life events (no taxonomy, so cannot be queried meaningfully).
- Project subtypes (absent).
- `UNCLASSIFIED` vs `UNKNOWN` — one of the two is redundant.

## Reality check: which consumers are even alive

Relevant because Phase 6 (ER integration) must not design for dead code.

| Consumer | Status | Evidence |
| --- | --- | --- |
| `entityClassifier` | **LIVE** | deterministic, called on the ingestion path |
| `entityResolutionCore` | **DEAD** | no references in `apps/server/src` |
| `episodeSegmentationCore` | **DEAD** | no references |
| `relationshipFoundationService` | **batch-only** | called from scripts + diagnostics + `eventRecoveryService`, not the live chat path |
| `eventRecoveryService` | **batch-only** | scripts + diagnostics + `graphRecoveryTrigger` |
| `threadSummaryService` | **LIVE** | wired into `ingestionPipelineClass` + `threadIntelligenceService` |

(Consistent with the consolidation/composer-truth audits in memory.)

## What good looks like

1. **One** stable root vocabulary, 15–25 types, that every layer shares — no per-boundary translation.
2. A **dynamic classification layer** (nightclub, punk band) that grows without touching the root vocabulary.
3. Lanes/relationship-kinds become **dynamic classifications**, not hardcoded enums.
4. Promotion to Character (and any narrowing) is **confidence-gated**, with the anti-pollution rules from `entityClassifier` kept as hard gates.

Design follows in [dynamic-classification-model.md](dynamic-classification-model.md).

# Entity Classification Audit

Scope: production failures where non-people become Characters and where duplicate people are created instead of merge/defer decisions.

## Pipeline Code Path

### Chat Messages

1. Raw user message
2. `apps/server/src/services/omegaChatService.ts`
   - saves user message to `chat_messages`
   - enqueues ingestion
3. `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`
   - runs extraction/fact/entity detectors
4. `apps/server/src/services/omegaMemoryService.ts`
   - extracts and resolves `omega_entities`
5. `apps/server/src/services/characterFoundationService.ts`
   - promotes eligible person entities to `characters`
6. `apps/server/src/services/characterRegistry.ts`
   - `classifyForCreation`
   - `mergeMention`
   - `recordPendingQuestion`

### Journal / Entry Path

1. Raw entry
2. `apps/server/src/services/peoplePlacesService.ts`
   - `detectEntities`
   - `inferType`
   - `people_places` upsert
3. `characterFoundationService.promoteEntityToCharacter`
4. `characterRegistry.classifyForCreation`
5. Character card creation or merge/defer

## Reported Misclassifications

| Input | Observed | Expected | Root Cause |
| --- | --- | --- | --- |
| High Noons | Character | Product / Beverage | Unknown proper noun defaulted to person; plural product not normalized |
| Amazon Ring | Character | Product | Company-prefixed product was not classified before promotion |
| Amazon | Character | Organization | LLM/entity path treated public org as person |
| Moreno Valley | Character | Location | Place lexicon/pattern missing or bypassed |
| Find My | Character | App | App/product names lacked deterministic gate |
| Mom's House | Character | Location / Household | Possessive dwelling was not typed before Character promotion |

## Root Causes

### 1. Unknown Proper Nouns Became People

Severity: Critical

Root cause:

- Previous classification treated unknown capitalized phrases as `person`.
- Person-typed rows are eligible for Character card promotion.

Affected files:

- `apps/server/src/services/peoplePlacesService.ts`
- `apps/server/src/services/entities/entityClassifier.ts`
- `apps/server/src/utils/entityMentionClassifier.ts`

Fix recommendation:

- Fixed for `peoplePlacesService`: deterministic `classifyEntity` now requires positive person evidence.
- Remaining: route omega/chat extraction through the same deterministic classifier before promotion.

### 2. LLM Entity Types Were Trusted Too Much

Severity: Critical

Root cause:

- LLM extraction can label products, apps, locations, or organizations as people.
- The chat/omega path still needs a deterministic override before creating cards.

Affected files:

- `apps/server/src/services/omegaMemoryService.ts`
- `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`
- `apps/server/src/services/characterFoundationService.ts`

Fix recommendation:

- Before resolving/promoting omega entities, call `classifyEntity(name, context)`.
- Only `PERSON` should enter Character promotion.
- Products/apps should map to platform/product-like storage, organizations to orgs, households/places to locations.

### 3. Character Promotion Needs Defense in Depth

Severity: High

Root cause:

- `promoteEntityToCharacter` checks stored type, but stored type can be stale or produced by another pipeline.
- Historical rows can keep bad `person` type values.

Affected files:

- `apps/server/src/services/characterFoundationService.ts`
- `apps/server/src/services/peoplePlacesService.ts`
- `apps/server/src/services/omegaMemoryService.ts`

Fix recommendation:

- Add a final `classifyEntity(entity.name, evidenceContext)` check inside promotion.
- Skip promotion unless `isCharacterEligible(classification.type)`.
- Add a repair script to retype historical bad rows and detach/delete false Character cards.

### 4. Plural and Variant Product Names

Severity: Medium

Root cause:

- Exact lexicons catch `High Noon`, but casual text may say `High Noons`.

Affected files:

- `apps/server/src/services/entities/entityClassifier.ts`

Fix recommendation:

- Normalize simple plural forms before lexicon lookup.
- Add test cases for `High Noons`, `Ring camera`, and `Find My iPhone`.

## Current Classifier Behavior

`apps/server/src/services/entities/entityClassifier.ts` now implements the correct rule:

- Products/apps/companies/places/households/events are classified before person checks.
- `PERSON` requires positive evidence:
  - honorific/kinship prefix
  - relationship phrase
  - person predicate in context
- Unknown proper noun defaults to `UNCLASSIFIED`, not person.

Regression tests:

- `apps/server/tests/services/entityClassifier.test.ts`

## Merge Logic Audit

### Current Behavior

Primary creation choke point:

- `characterRegistry.classifyForCreation`

Actions:

- `reject`: junk/non-person
- `merge`: exact/alias/single certain candidate
- `defer`: ambiguous, records pending question
- `create`: no plausible existing match

User-facing merge:

- `apps/server/src/routes/characters.ts`
- `apps/server/src/services/characterMergeService.ts`
- UI in `apps/web/src/components/characters/CharacterBook.tsx`

### Duplicate Generation Paths

Severity: High

Paths:

- Journal path creates `people_places` then character.
- Chat omega path creates `omega_entities` then character.
- Document import path may bypass the registry.
- Historical stale `person` rows can be re-promoted.

Root cause:

- Dedup is split by source key (`source_entity_id`, omega ID, name/alias), not one canonical identity index.

Fix recommendation:

- Require all character-creating paths to call `characterRegistry.classifyForCreation`.
- Add a canonical identity index keyed by normalized name + aliases + source entity IDs.
- Store `distinct_from_mentions` when user says "not that Juan" so future duplicate suggestions respect the answer.

### Required Merge Examples

| Case | Correct Behavior |
| --- | --- |
| Hell Fairy / Daisy | Suggest alias or merge before creating a second card if one is known as the other |
| Hell Fairy / Hell Fairy from Underground Scene | Defer unless evidence says same person; do not auto-create descriptive duplicate |
| Oscuri.dad / Juan | Do not auto-merge without user confirmation |
| Tio Juan / Juan Oscuri.dad | Suggest merge/defer before creating duplicate; kinship prefix plus first-name overlap is ambiguous |

### Canonical Identity Strategy

1. Normalize all names with `normalizeNameKey`.
2. Match exact primary name and alias first.
3. Match known source IDs second.
4. If one side is bare first name and another is kinship/full name, defer to user.
5. If a descriptive card contains an existing alias, suggest merge before create.
6. If user confirms merge, add losing name as alias and store merge record.
7. If user rejects merge, store `distinct_from_mentions` so the same suggestion does not return.

## Ranked Fix Plan

### P0

- Enforce deterministic classifier on omega/chat entity extraction before promotion.
- Add promotion boundary guard in `characterFoundationService`.
- Backfill/retype false Character cards for known bad classes: products, apps, organizations, locations, households.

### P1

- Normalize plural product/app names.
- Improve `/api/characters/duplicates` with alias overlap and distinctness memory.
- Route document-created characters through `characterRegistry`.

### P2

- Add admin repair endpoint for stale `people_places.type = person` rows.
- Add tests for omega extraction override.

### P3

- Replace split source-key dedupe with a single canonical identity index across `people_places`, `omega_entities`, and `characters`.

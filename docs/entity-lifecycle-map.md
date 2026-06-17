# Entity Lifecycle Map

Status: Entity Integrity Sprint baseline.

## Authoritative Lifecycle

All new entity paths should converge on:

`Message/Entry/Document -> Extraction -> Deterministic Classification -> LLM Extraction/Advisory Typing -> Resolution -> Merge Suggestion -> Evidence Link -> Promotion Candidate -> Character Card`

Authoritative classifier: `apps/server/src/services/entities/entityClassifier.ts`.

## Path 1: Journal / Memory Entry

Entry point: `apps/server/src/services/memoryService.ts`

1. `saveEntry()` writes `journal_entries`.
2. `peoplePlacesService.recordEntitiesForEntry()` extracts and upserts `people_places`.
3. `peoplePlacesService` uses `classifyEntity()` and `toStorageType()` so obvious non-persons become `place`, `organization`, `platform`, `event`, or `unclassified`, not `person`.
4. `memoryService.saveEntry()` only calls `characterFoundationService.promoteEntityToCharacter()` for `people_places.type = person`.
5. `promoteEntityToCharacter()` now blocks known non-person classifications and requires repeat evidence before creating a Character.
6. `characterRegistry.classifyForCreation()` handles exact merge, alias merge, duplicate defer, junk rejection, and pending questions before any card creation.

Risk before sprint: `inferType()` and legacy extractors could default unknown proper nouns to person, causing products/apps/places to create Character cards.

## Path 2: Chat / Conversation Ingestion

Entry point: `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`

1. Normalized user utterances are joined into a full message.
2. `omegaMemoryService.extractEntities()` runs deterministic extraction first for obvious entities, then treats LLM output as advisory.
3. LLM output is reclassified with `classifyEntity()` before storage.
4. `omegaMemoryService.resolveEntities()` resolves by exact/alias, fuzzy, semantic match, then creates `omega_entities` only if unresolved.
5. `ingestionPipelineClass` promotes only `PERSON`/`CHARACTER` omega entities from user messages.
6. `characterFoundationService.promoteOmegaEntityToCharacter()` blocks known non-person classifications and requires repeat evidence before card creation.
7. Character-thread links are written through `entityConversationLinkService`.

Risk before sprint: chat extraction trusted LLM `PERSON` labels, so `Find My`, `Amazon Ring`, or `High Noons` could enter `omega_entities` as people and then promote.

## Path 3: Omega Memory Direct Ingestion

Entry point: `apps/server/src/services/omegaMemoryService.ts`

1. `ingestText()` calls `extractEntities()`.
2. Deterministic extraction catches known entities before LLM.
3. LLM entities are filtered by confidence, then reclassified deterministically.
4. Unknowns are not stored as people.
5. `resolveEntities()` deduplicates within existing type pools before creation.
6. Claims, relationships, evidence, contradiction checks, and suggestions attach to resolved entities.

Risk before sprint: `EntityType` only represented `PERSON | CHARACTER | LOCATION | ORG | EVENT`, forcing products/apps/media into the wrong buckets.

## Path 4: Document Import

Entry point: `apps/server/src/services/documentService.ts`

1. `processDocument()` extracts text and asks the LLM for entries, characters, memoir sections, language style, and themes.
2. Entries are saved through `memoryService.saveEntry()`, which follows the journal path.
3. LLM-proposed `characters` are now reclassified with `classifyEntity()`.
4. Non-person classifications are skipped.
5. Remaining candidates must pass `characterRegistry.classifyForCreation()` before a Character upsert.

Risk before sprint: document imports directly upserted `characters`, bypassing registry, classifier, duplicate review, and promotion rules.

## Path 5: Generic Entity Resolver / Legacy `entities`

Entry points:

- `apps/server/src/services/entities/entityExtractor.ts`
- `apps/server/src/services/entities/entityResolver.ts`
- `apps/server/src/services/entities/storageService.ts`

Lifecycle:

1. Regex extraction produces candidate names.
2. The candidate name is now classified through `classifyEntity()`.
3. Legacy storage receives `person`, `place`, `org`, `event`, `thing`, or `unknown`.
4. `DuplicateDetector` resolves exact/fuzzy duplicates.
5. `EntityStorage` creates `entities` and `entity_mentions`.

Risk before sprint: capitalized words were emitted as `person` by default. Unknown proper nouns now remain `unknown`.

## Path 6: Manual Character Creation

Entry point: `apps/server/src/routes/characters.ts`

1. POST `/api/characters` validates input.
2. Existing name/alias matches merge first.
3. `characterRegistry.classifyForCreation()` rejects known non-person names and defers ambiguous duplicates.
4. Only an explicit create decision inserts a Character.

Manual creation remains possible for unknown names because the user is deliberately creating a card. Automatic ingestion is held to stricter promotion rules.

## Merge Integrity Path

Entry point: `apps/server/src/routes/characters.ts` duplicate review and `characterRegistry`.

1. Exact duplicate names receive high-confidence merge suggestions.
2. Alias overlap receives high-confidence merge suggestions.
3. Containment matches receive lower-confidence review suggestions, especially kinship/context cases like `Tio Juan` versus `Juan`.
4. Merges are never automatic from duplicate review; the user chooses the survivor card.
5. `entity_questions` is used for ambiguous mention resolution before duplicate creation.

Known audit cases:

- `Daisy <-> Hell Fairy`: should resolve only through explicit alias/user confirmation, not fuzzy auto-merge.
- `Juan <-> Oscuri.dad`: should merge through exact alias or user-confirmed pending question.
- `Mom <-> Mother`: should merge through alias/canonical kinship normalization when user confirms identity.
- `Tio Juan <-> Juan`: should remain review-required because one may be an uncle and the other a different Juan.

## Current Choke Points

- `classifyEntity()` is the source of truth for type.
- `toStorageType()` maps canonical ontology into `people_places`.
- `toOmegaType()` maps canonical ontology into omega entities.
- `characterRegistry.classifyForCreation()` blocks non-person Character creation.
- `characterFoundationService` enforces promotion evidence.
- `/api/characters/duplicates` exposes confidence-scored merge suggestions.

## Remaining Architecture Debt

The repo still has multiple physical entity tables: `characters`, `omega_entities`, `people_places`, `entities`, plus locations and organizations. The sprint creates a shared classifier and promotion boundary, but the long-term fix is a single canonical entity table with typed projections into Characters, Places, Organizations, and Biography views.

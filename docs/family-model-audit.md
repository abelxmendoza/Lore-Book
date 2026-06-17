# Family Model Audit

Scope: household naming, family branches, family graph structure, kinship importance, and evidence linking for biographies.

## Current Code Paths

### Family / Household Detection

1. `apps/server/src/services/groupDetectionService.ts`
   - detects family group signals from chat/journal text
   - extracts existing character members
2. `apps/server/src/services/groupCandidateService.ts`
   - queues or auto-creates group candidates
   - names unnamed family groups
3. `apps/server/src/services/entities/householdNaming.ts`
   - deterministic household/family naming
4. `apps/server/src/services/organizationService.ts`
   - creates accepted organization/family group

### Family Tree

1. `apps/server/src/services/conversationCentered/entityRelationshipDetector.ts`
   - extracts kinship relationships
2. `character_relationships`
   - stores person-to-person family edges
3. `apps/server/src/services/familyTreeService.ts`
   - builds tree from relationship edges
4. `apps/server/src/routes/familyTrees.ts`
   - serves tree endpoints

### Importance

1. `apps/server/src/services/characters/characterImportanceService.ts`
   - deterministic current scorer
2. `apps/server/src/services/characterImportanceService.ts`
   - legacy/parallel scorer

### Evidence / Biography

1. Entity creation
2. `characterFoundationService.promoteEntityToCharacter`
3. `characterFoundationService.linkCharacterToMemories`
4. `entity_conversation_links`
5. `character_memories`
6. `biographyGenerationEngine`

## Issues

### 1. Household Modeling

Severity: Medium

Root cause:

- Households are partially represented as groups/organizations and partially as locations (`Mom's House` maps to place).
- Household hypotheses live separately in character metadata.
- No single persisted household object owns members, address/location, time span, and evidence.

Affected files:

- `apps/server/src/services/entities/entityClassifier.ts`
- `apps/server/src/services/conversationCentered/contextualIntelligence/householdKnowledgeBuilder.ts`
- `apps/server/src/services/groupCandidateService.ts`
- `apps/server/src/services/organizationService.ts`

Fix recommendation:

- Keep `Mom's House` as a location/household place, not a Character.
- For family groups, store member IDs and evidence in the organization/group layer.
- Add explicit metadata fields: `household_anchor_character_id`, `member_character_ids`, `location_entity_id`, `evidence_message_ids`.

### 2. Family Branch Naming

Severity: High

Root cause:

- Unnamed family groups used first-name concatenation, producing names like `Leslie & Tio Family`.
- Correct naming should prefer shared surname or senior kinship anchor.

Affected files:

- `apps/server/src/services/entities/householdNaming.ts`
- `apps/server/src/services/groupCandidateService.ts`
- `apps/server/src/services/groupDetectionService.ts`

Fix recommendation:

- Fixed: unnamed family candidates now use `nameHousehold`.
- Fixed: generic `My Family` detections with members are normalized through `nameHousehold`.
- Remaining: pass mention counts into `nameHousehold` so tie-breaks use real evidence.

Expected behavior:

- `Leslie`, `Tio Ralph` -> `Tio Ralph's Family`
- Shared surname members -> `{Surname} Family`
- No senior kinship/surname -> `{Most Mentioned Member}'s Family`

### 3. Head of Household Detection

Severity: Medium

Root cause:

- The naming helper detects senior kinship from names but does not yet read graph edges or mention counts.
- A true head/anchor should come from relationship role plus evidence, not string rank alone.

Affected files:

- `apps/server/src/services/entities/householdNaming.ts`
- `apps/server/src/services/familyTreeService.ts`
- `apps/server/src/services/groupCandidateService.ts`

Fix recommendation:

- Compute household anchor from:
  - parent/grandparent/uncle/aunt relationship role
  - oldest generation in family graph
  - mention count
  - explicit phrase like "Ralph's family"
- Persist anchor in group metadata.

### 4. Parent / Grandparent / Step-Parent Importance

Severity: High

Root cause:

- Generic family boost was too small.
- A parent with one memory could score near a random scene contact.
- Step-parent language was not consistently included.

Affected files:

- `apps/server/src/services/characters/characterImportanceService.ts`
- `apps/server/src/services/characterImportanceService.ts`

Fix recommendation:

- Fixed in deterministic scorer: structural family floors now raise parent/grandparent/child/spouse, siblings, aunts/uncles, and cousins/family above random contacts.
- Fixed: legacy importance service now uses the shared OpenAI client and quota gate.
- Remaining: add explicit step-parent patterns to both relationship extraction and importance.

Current floors:

- Parent/grandparent/child/spouse: 65
- Sibling: 60
- Aunt/uncle: 50
- Cousin/family: 40

### 5. Family Graph Structure

Severity: Medium

Root cause:

- Tree rendering depends on edges in `character_relationships`, but branch labels are partly inferred.
- Maternal/paternal/step branches are not fully persisted as first-class edge metadata.

Affected files:

- `apps/server/src/services/familyTreeService.ts`
- `apps/server/src/services/conversationCentered/entityRelationshipDetector.ts`
- `apps/web/src/components/family/FamilyTreeView.tsx`

Fix recommendation:

- Persist relationship edge type and branch side at insertion time.
- Support explicit edge types:
  - `parent_of`
  - `child_of`
  - `sibling_of`
  - `spouse_of`
  - `step_parent_of`
  - `step_child_of`
  - `grandparent_of`
  - `aunt_uncle_of`
  - `cousin_of`
- UI should render persisted edge semantics, not infer them independently.

### 6. Evidence Linking Failures

Severity: Critical

Observed:

- Ashley, Jerry, James, and Tia Grace exist but biographies are thin.
- Entity/Character existence does not guarantee connected evidence.

Root cause:

- Character creation can succeed from an entity node while `character_memories`, `entity_conversation_links`, or event links remain absent.
- Chat-origin evidence may live in `chat_messages`, while older biography code often expects `journal_entries` or `character_memories`.
- Thread/user-message persistence failures also reduced recoverable assistant/user context.

Affected files:

- `apps/server/src/services/characterFoundationService.ts`
- `apps/server/src/services/conversationCentered/entityConversationBackfillService.ts`
- `apps/server/src/services/biographyGeneration/biographyGenerationEngine.ts`
- `apps/server/src/services/chat/foundationRecallDataService.ts`
- `apps/server/src/services/conversationCentered/threadContentService.ts`

Fix recommendation:

- When a character is created or merged, immediately backfill links from:
  - `people_places.related_entries`
  - `chat_messages` matching name/alias
  - `entity_conversation_links`
  - timeline/event records mentioning the entity
- Biography generation must read chat evidence, not only journal-backed `character_memories`.
- Add a diagnostic: character exists but has zero evidence links.

## Implementation Plan

### P0

- Keep non-person household/location entities out of Characters. Status: classifier path fixed for `peoplePlacesService`; omega path still needs promotion guard.
- Backfill evidence links for existing thin characters. Status: remaining.
- Add diagnostic for Character with no `character_memories` and no `entity_conversation_links`. Status: remaining.

### P1

- Persist household anchor metadata.
- Add step-parent/step-child extraction and importance patterns.
- Pass mention counts to `nameHousehold`.

### P2

- Persist maternal/paternal/step branch side on relationship edges.
- Update family tree UI to trust persisted branch metadata.

### P3

- Consolidate the two importance services into one source of truth.
- Add a repair job for stale family groups with concatenated member names.

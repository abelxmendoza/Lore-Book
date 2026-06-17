# Entity Visibility Report

**Date:** 2026-06-17  
**Sprint:** Entity Visibility & Auto-Creation  
**Goal:** Users can see what LoreBook learned from conversations

---

## Executive Summary

LoreBook **extracts entities reliably** but **surfaces them inconsistently**. The chat response shows only a subset of what ingestion creates, and most extraction happens asynchronously after the user has already moved on.

| Layer | Visible today? | Gap |
|-------|----------------|-----|
| Extraction (LLM + deterministic) | No | Runs async in ingestion queue |
| Resolution (`omega_entities`) | Partial | Hidden unless promoted or suggested |
| Character promotion | Partial | Suggestions panel only; not post-chat |
| Facts, relationships, events | No | Stored silently |
| Chat `mentionedEntities` | Yes | **Wrong source** — `people_places` substring match, not fresh extraction |

**Root cause:** Chat metadata is built synchronously from legacy `people_places`, while the canonical pipeline writes `omega_entities` asynchronously. Users see stale or empty chips while LoreBook learns in the background.

---

## Phase 1 — Entity Pipeline Audit

### Canonical flow (chat)

```
User message
    ↓
POST /api/chat/stream  (omegaChatService.chatStream)
    ↓
chat_messages INSERT
    ↓
ingestionQueue.enqueue → ingestFromChatMessage
    ↓
ConversationIngestionPipeline.ingestMessageCore
    ↓
omegaMemoryService.extractEntities(fullNormalizedText)
    ↓  LLM (confidence ≥ 0.5) + deterministic (confidence ≥ 0.8)
    ↓  Reclassified via classifyEntity()
omegaMemoryService.resolveEntities(candidates)
    ↓  entityResolutionBridge → entityResolutionCore (shadow/on/off)
    ↓  Exact → alias → Jaro-Winkler → semantic → create
omega_entities INSERT/UPDATE  (mention_status, mention_count)
    ↓
characterFoundationService.promoteOmegaEntityToCharacter  (USER msgs, PERSON only)
    ↓  characterRegistry.classifyForCreation → reject|merge|defer|create
characters INSERT  (if create + evidence gates pass)
    ↓
entityFactsService.extractAndPersistFacts
    ↓
unifiedErIngestion → relationships, scopes
    ↓
chat_messages.metadata.entity_ids UPDATE  (post-async)
```

### Parallel / legacy paths

| Path | Entry | Storage | UI surface |
|------|-------|---------|------------|
| Journal | `memoryService.saveEntry` | `people_places` → `characters` | Character Book |
| Legacy resolver | `EntityResolver.process` | `entities` + `entity_mentions` | Entity Resolution dashboard |
| Location resolver | `LocationResolver.process` | `locations` + `location_mentions` | Location Book |
| Document import | `documentService.processDocument` | via journal path | Character Book |
| Nickname extractors | `omegaChatService` (fire-and-forget) | `characters`, `locations` | **Hidden** until user opens book |
| Shadow merged extractor | `shadowModeOrchestrator` | `shadow_extraction_log` only | Never |

### All creation paths

| Entity type | Auto-create trigger | Storage table | Gate |
|-------------|---------------------|---------------|------|
| Person (omega) | `resolveEntities` no match | `omega_entities` | confidence ≥ 0.5 extract; create on unresolved |
| Person (character) | `promoteOmegaEntityToCharacter` | `characters` | USER sender; registry create; ≥2 mentions or full name |
| Person (journal) | `promoteEntityToCharacter` | `characters` | `people_places.type = person`; repeat evidence |
| Person (nickname) | `characterNicknameService` | `characters` | Unnamed reference in chat; fire-and-forget |
| Location (omega) | `resolveEntities` | `omega_entities` | Same as person |
| Location (book) | `locationNicknameService` | `locations` | Unnamed place; fire-and-forget |
| Location (suggestion) | User accepts | `locations` | `locationSuggestionService` |
| Organization | User accepts group candidate | `organizations` | `groupCandidateService` review |
| Organization (omega) | `resolveEntities` | `omega_entities` | No auto-promote to org book |
| Event | `eventExtractionService` | `conversation_events`, `event_candidates` | Candidates require review |
| Skill | `skillExtractionService` | `skills` | Journal + ingestion; suggestions API |
| Goal | Quest abandonment, goal storage | `goals` | No chat auto-create |
| Relationship | `unifiedErIngestion` | `character_relationships`, `entity_relationships` | Threshold gates |
| Fact | `entityFactsService` | `entity_facts` | Post-resolution; per-fact confidence |

### All promotion paths

| From | To | Mechanism |
|------|----|-----------|
| `omega_entities` `mentioned_only` | `confirmed` | `mention_count ≥ 2` (`ENTITY_CONFIRMATION_THRESHOLD`) |
| `omega_entities` PERSON | `characters` | `promoteOmegaEntityToCharacter` + registry |
| `people_places` person | `characters` | `promoteEntityToCharacter` |
| Gray-zone name | `entity_questions` | `characterRegistry.defer` |
| Near-duplicate | Merge alias | `characterRegistry.merge` (user-confirmed) |
| Omega suggestion | Approved entity | POST `/api/omega-memory/suggestions/:id/approve` |
| Group candidate | `organizations` | User accept in `GroupSuggestions` |
| Location suggestion | `locations` | User accept |
| Disambiguation answer | `characters` | `entityResolutionService.createEntityFromClarification` |

### Hidden paths (created, not shown)

1. **`omega_entities` with `mention_status: 'mentioned_only'`** — excluded from resolution dashboard unless confirmed
2. **SECONDARY/TERTIARY resolution tier** — `is_user_visible: false` by default
3. **Nickname auto-creation** — characters/locations created fire-and-forget with no chat notification
4. **Facts (`entity_facts`)** — attached to entities; visible only in character detail/knowledge views
5. **Relationships** — written by ER ingestion; partial relationship UI
6. **Event candidates** — pending review, not in Events Book
7. **Group candidates** — `GroupSuggestions.tsx` only
8. **Shadow extraction logs** — diagnostics only
9. **AI-message ingestion** — pipeline runs but character promotion skipped for non-USER senders
10. **`chat_messages.metadata.entity_ids`** — written post-async; not in first SSE metadata event

### What the client receives today

**SSE first event:** `{ type: 'metadata', data: StreamingChatResponse.metadata }`

| Field | Source | Includes fresh extraction? |
|-------|--------|---------------------------|
| `mentionedEntities` | `people_places` substring match on message text | **No** |
| `characterIds` | Same people_places filter | **No** |
| `disambiguationPrompt` | `entityAmbiguityService` | Sometimes |
| `memorySuggestion` | Proactive capture | Sometimes |
| `sources`, `connections` | RAG citations | N/A |

Comment in `chat.ts`: *"Pipeline status intentionally not surfaced to user — trust > transparency of ops"*

---

## Phase 2 — Entity Visibility (Target Design)

### Post-chat entity panel

After each user message (or on thread refresh), show extracted entities grouped by canonical type:

| Group | Source types | Example |
|-------|--------------|---------|
| **People** | PERSON, CHARACTER | Abuela, Kelly, Tio Juan |
| **Places** | LOCATION, place | Costco, Abuela's house |
| **Organizations** | ORG, organization, platform | Amazon, Club Metro |
| **Communities** | social_communities (detected) | Discord server, friend group |
| **Projects** | project (when extracted) | LoreBook, OmegaFrame |
| **Goals** | goal mentions | "get promoted", "move out" |
| **Skills** | skill mentions | TypeScript, leadership |
| **Events** | EVENT, conversation_events | Leslie's graduation party |

### Per-entity row (minimum)

| Field | Source |
|-------|--------|
| Name | Extracted canonical name |
| Type badge | `classifyEntity()` ontology |
| Status | `mentioned_only` / `confirmed` / `promoted` / `suggested` |
| Confidence | Extraction + resolution score |
| Evidence count | `mention_count` or fact count |
| Source conversation | `session_id` + message snippet |
| Action | View in book / Confirm / Dismiss / Merge |

### Data source for panel

**Do not** reuse `people_places` substring matching. Instead:

1. **Immediate (sync):** Run lightweight `extractEntities` on message text for display-only preview (no writes)
2. **Authoritative (async):** Poll or SSE-push ingestion result with resolved entity IDs from `ingestMessageCore` return value
3. **Persisted:** GET `/api/conversation/threads/:id/extracted-entities` reading `entity_conversation_links` + `omega_entities` + promotion status

### Existing UI to extend

| Component | Today | Extend to |
|-----------|-------|-----------|
| `EntityChipsRow` | 3 types from stale match | All groups + status badges |
| `DetectedCharacterSuggestions` | Character book only | Pattern for all types |
| `EntityClarificationChip` | Inline disambiguation | Wire to defer/create actions |
| `ThreadEntityChips` | Thread focus | Full extraction summary |
| `GroupSuggestions` | Organizations | Template for review flows |

---

## Phase 5 — Trust & Provenance (Requirements)

Every visible entity **must** display:

| Provenance field | DB source | Display |
|------------------|-----------|---------|
| Source conversation | `entity_conversation_links.source_thread_id` | "From chat · Mar 12" |
| Source message | `entity_conversation_links` or `entity_mentions` | Snippet (≤80 chars) |
| Evidence count | `omega_entities.mention_count` or `entity_facts` count | "Mentioned 3×" |
| Confidence | Extraction confidence × resolution confidence | Low / Medium / High badge |
| Creation source | Pipeline path enum | "Auto-detected" / "You confirmed" / "You created" |

### Confidence display tiers

| Tier | Score range | Label | Color |
|------|-------------|-------|-------|
| High | ≥ 0.7 | Confirmed | Green |
| Medium | 0.32–0.69 | Likely | Amber |
| Low | < 0.32 | Mentioned | Gray |

Maps to `entityResolutionCore` recommendations: `auto_resolve`, `merge_suggestion`, `create_separate`, `skip`.

### Trust rules

1. **Never show auto-created entities as "confirmed"** until `mention_status = confirmed` or user accepts
2. **Always show creation source** — distinguish auto-detect vs user manual vs import
3. **Link to evidence** — tap entity → see source message(s)
4. **Allow dismiss** — rejected entities must not re-surface (`entity_questions` dismissed state)
5. **No silent creation in UI** — if something was auto-created, show it in post-chat panel within 5s

---

## Gap Analysis

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| G1 | Chat chips use `people_places`, not extraction output | P0 | Return ingestion entities in metadata or post-chat poll |
| G2 | Ingestion is async; user never sees result | P0 | SSE `type: 'entities'` event after queue completes |
| G3 | `omega_entities` hidden by default | P1 | Post-chat panel reads omega + promotion status |
| G4 | Nickname/location auto-create is silent | P1 | Surface in post-chat "New detections" section |
| G5 | Facts, relationships invisible | P2 | Expand entity detail modal |
| G6 | No unified API for "what was learned this message" | P0 | New endpoint aggregating extraction result |

---

## Key files

| Area | Path |
|------|------|
| Chat stream + metadata | `apps/server/src/services/omegaChatService.ts` |
| Ingestion pipeline | `apps/server/src/services/conversationCentered/ingestionPipelineClass.ts` |
| Extraction + resolution | `apps/server/src/services/omegaMemoryService.ts` |
| Resolution core | `apps/server/src/services/entities/entityResolutionCore.ts` |
| Character gates | `apps/server/src/services/characterRegistry.ts` |
| Entity chips (UI) | `apps/web/src/features/chat/message/EntityChipsRow.tsx` |
| Character suggestions | `apps/web/src/components/characters/DetectedCharacterSuggestions.tsx` |
| Lifecycle map (prior) | `docs/entity-lifecycle-map.md` |

---

## Success criteria

- [ ] User sees extracted entities within 5s of sending a message
- [ ] Every visible entity shows source conversation + evidence count + confidence
- [ ] Entity chips reflect fresh extraction, not legacy substring match
- [ ] Auto-created entities appear in post-chat panel before Character Book
- [ ] User can confirm, dismiss, or merge from post-chat without navigating away

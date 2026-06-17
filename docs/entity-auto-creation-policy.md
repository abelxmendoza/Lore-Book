# Entity Auto-Creation Policy

**Date:** 2026-06-17  
**Sprint:** Entity Visibility & Auto-Creation  
**Scope:** When LoreBook creates entities automatically vs suggests vs never creates

---

## Policy framework

Three tiers govern every entity type:

| Tier | Behavior | User sees |
|------|----------|-----------|
| **Auto-create** | Write to storage immediately; show in post-chat panel | "Detected · Abuela" with evidence |
| **Suggest-create** | Write to staging (`mentioned_only`, candidates, questions); user confirms | "Did you mean…?" with Confirm / Dismiss |
| **Never-auto-create** | Extract and link only; no new row without explicit user action | Mention in context; link to existing |

Decision inputs: **confidence**, **evidence count**, **resolution status**, **entity type**, **sender role**.

---

## Global gates (all types)

Applied before any auto-create:

| Gate | Rule | File |
|------|------|------|
| Extraction floor | LLM confidence ≥ **0.5** | `omegaMemoryService.extractEntities` |
| Deterministic floor | Classifier confidence ≥ **0.8** | `extractEntities` deterministic pass |
| Self-entity block | Never create entity for first-person narrator | `extractEntities` prompt |
| Non-person block | `classifyEntity()` → not `PERSON` → no character promotion | `characterRegistry`, `characterFoundationService` |
| Junk rejection | Pronouns, stopwords, known locations/orgs → `reject` | `characterRegistry.classifyForCreation` |
| USER-only promotion | Character auto-promote only from USER messages, not AI | `ingestionPipelineClass` |
| Shadow mode | ER core in `shadow` → legacy authoritative; no extra creates | `entityResolutionConfig` |

---

## People (PERSON / CHARACTER)

### Auto-create → `omega_entities`

| Condition | Action |
|-----------|--------|
| Extracted with confidence ≥ 0.5 | Store as `omega_entities` |
| Unresolved after resolution | `createEntity` with `mention_status: 'mentioned_only'`, `mention_count: 1` |
| Resolution `auto_resolve` (confidence ≥ 0.7) | Link to existing; increment mention count |

### Auto-create → `characters`

| Condition | Action |
|-----------|--------|
| `classifyForCreation` → `create` | Insert character card |
| Full name (first + last) OR `mention_count ≥ 2` | Passes `shouldDeferCharacterPromotion` |
| USER message sender | Required |
| Registry not `reject` or `defer` | Required |

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| `classifyForCreation` → `defer` | `entity_questions` | `EntityClarificationChip` / disambiguation prompt |
| Resolution → `merge_suggestion` (0.32–0.69) | Existing entity + alias candidate | Merge suggestion in Character Book |
| `omega_entities` `mentioned_only`, ≥2 mentions | `characterSuggestionService` | `DetectedCharacterSuggestions` |
| Resolution → `disambiguate` (margin < 0.18) | Multiple candidates ranked | Inline "Which Juan?" prompt |

### Never-auto-create

| Condition | Reason |
|-----------|--------|
| `classifyForCreation` → `reject` | Junk, pronoun, known location/org masquerading as person |
| Single-token first name, 1 mention | `shouldDeferCharacterPromotion(name, 1)` → defer |
| Kinship ambiguity (Tio Juan vs Juan) | Registry defers; requires user confirmation |
| Duplicate exact match to existing | `merge` — alias only, no new card |
| AI-assistant message | Promotion skipped entirely |

### Promotion lifecycle

```
mentioned_only (mention_count: 1)
    ↓ 2nd mention (ENTITY_CONFIRMATION_THRESHOLD = 2)
confirmed (omega_entities.mention_status)
    ↓ registry create + evidence gates
characters row
    ↓ user can merge/dismiss via suggestions
```

---

## Places (LOCATION)

### Auto-create

| Condition | Storage | Notes |
|-----------|---------|-------|
| Unresolved LOCATION in extraction | `omega_entities` | Same as people |
| Unnamed place in chat (nickname service) | `locations` | **Fire-and-forget — should become suggest-create** |

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| `locationSuggestionService` candidate | Suggestion queue | `DetectedLocationSuggestions` |
| User accepts | `locations` INSERT | Location Book |

### Never-auto-create

| Condition | Reason |
|-----------|--------|
| Known org/platform misclassified as place | `classifyEntity()` reroutes |
| Generic place ("home", "work") without disambiguation | Low confidence → skip |

**Storage split note:** Facts lookup uses `people_places` (type=location), not `locations`. Auto-created omega locations may not receive facts until promoted.

---

## Organizations (ORG)

### Auto-create

| Condition | Storage |
|-----------|---------|
| Unresolved ORG in extraction | `omega_entities` only |

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| `groupCandidateService.processChatMessage` | `group_candidates` | `GroupSuggestions.tsx` |
| User accepts | `organizations` INSERT | Organizations Book |

### Never-auto-create

| Condition | Reason |
|-----------|--------|
| Platform/product names (Amazon, iPhone) | Classified as platform/product, not org |
| Informal group without evidence | Below ER threshold |

---

## Communities

### Auto-create

None in chat path today.

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| Louvain/social network detection | `social_communities` | Analytics only — **no book UI** |

### Never-auto-create

Communities require explicit user grouping or future review flow.

---

## Projects

### Auto-create

None. Projects are read in `workingMemoryAssembler` but have no chat creation path.

### Suggest-create

Future: extract project mentions → suggest link to existing project or create.

### Never-auto-create (current)

All project mentions until extraction + UI path exists.

---

## Goals

### Auto-create

| Condition | Storage |
|-----------|---------|
| Quest abandonment conversion | `goals` via `questService.convertAbandonedQuestToGoal` |

### Suggest-create

Future: goal mention in chat → suggest add to Goals panel.

### Never-auto-create (current)

Direct chat mentions of goals/intentions.

---

## Skills

### Auto-create

| Condition | Storage | Gate |
|-----------|---------|------|
| Journal entry processing | `skills` | `skillExtractionService.processEntryForSkills` |
| Ingestion pipeline step | `skills` | Same service |

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| Pending skill detection | Suggestion queue | GET `/api/skills/suggestions` → Skills Book |
| User confirms | `skills` materialize | POST `/api/skills/suggestions/:id/confirm` |

### Never-auto-create

Skills mentioned once in casual chat without evidence chain.

---

## Events

### Auto-create

| Condition | Storage |
|-----------|---------|
| Structured event extraction | `conversation_events` |
| Engine resolver (journal) | `events` + `event_mentions` |

### Suggest-create

| Condition | Staging | UI |
|-----------|---------|-----|
| Event assembly in pipeline | `event_candidates` | Review queue (no dedicated book flow) |
| User confirms | `events` | Events Book |

### Never-auto-create

Vague temporal references ("last week", "that day") without event structure.

---

## Relationships

### Auto-create

| Condition | Storage | Gate |
|-----------|---------|------|
| Unified ER ingestion | `character_relationships`, `entity_relationships` | `ASSERTED_THRESHOLD`, `EPISODIC_THRESHOLD` |
| ≥2 entities in message | Required for ER run | `unifiedErIngestion` |

### Suggest-create

Low-confidence relationship edges → review in Entity Resolution dashboard.

### Never-auto-create

Speculative/inferred relationships below ER threshold.

---

## Facts (`entity_facts`)

### Auto-create

| Condition | Storage | Confidence |
|-----------|---------|------------|
| Post-resolution fact extraction | `entity_facts` | 0.9 direct, 0.7 implied, 0.5 speculative |
| Character/org/location resolved | Required parent entity | |

### Suggest-create

Facts with confidence < 0.5 → do not persist (filtered at extraction).

### Never-auto-create

Facts about unresolved or `mentioned_only` entities without parent link.

---

## Decision matrix (quick reference)

| Type | Extract → omega | Auto book row | Suggest UI | Never |
|------|-----------------|---------------|------------|-------|
| Person | ✅ always | ✅ if gates pass | ✅ defer/merge | ❌ junk/1-mention first name |
| Place | ✅ always | ⚠️ nickname only | ✅ location suggestions | ❌ generic |
| Organization | ✅ always | ❌ | ✅ group candidates | ❌ products/platforms |
| Community | ❌ | ❌ | ⚠️ analytics only | ✅ default |
| Project | ❌ | ❌ | ❌ future | ✅ default |
| Goal | ❌ | ⚠️ quest path only | ❌ future | ✅ chat mentions |
| Skill | ❌ | ✅ journal/ingestion | ✅ skill suggestions | ❌ casual mention |
| Event | ✅ omega EVENT | ⚠️ conversation_events | ✅ event candidates | ❌ vague refs |
| Relationship | N/A | ✅ if ER thresholds | ✅ low confidence | ❌ below threshold |
| Fact | N/A | ✅ if parent exists | ❌ | ❌ no parent |

---

## Resolution core integration

When `ENTITY_RESOLUTION_CORE=on`, `entityResolutionCore.resolveMention` drives decisions:

| Recommendation | Policy tier | Confidence |
|----------------|-------------|------------|
| `auto_resolve` | Auto-create (link) | ≥ 0.7 |
| `merge_suggestion` | Suggest-create | 0.32–0.69 |
| `create_separate` | Auto-create (new omega row) | < 0.32, action=create |
| `skip` | Never-auto-create | Unknown bare token |

When `ENTITY_RESOLUTION_CORE=shadow` (default): legacy path authoritative; core logs disagreements only.

---

## Recommended policy changes

| # | Change | Rationale |
|---|--------|-----------|
| P1 | Move nickname auto-create to suggest-create | Silent character/location creation erodes trust |
| P2 | Return extraction summary in post-chat SSE | Closes visibility gap without waiting for book navigation |
| P3 | Unify org promotion: omega ORG → suggest in Organizations Book | Currently omega-only with no book path |
| P4 | Promote ER core from shadow → on after validation | Single resolution brain reduces duplicate creates |
| P5 | Block `entity_facts` on `mentioned_only` parents | Facts imply confirmed entities |

---

## Thresholds reference

| Constant | Value | File |
|----------|-------|------|
| `ENTITY_CONFIRMATION_THRESHOLD` | 2 mentions | `config/aiThresholds.ts` |
| LLM extraction floor | 0.5 | `omegaMemoryService.ts` |
| Deterministic extraction floor | 0.8 | `omegaMemoryService.ts` |
| ER high confidence | 0.7 | `entityResolutionCore.ts` |
| ER merge suggestion | 0.32 | `entityResolutionCore.ts` |
| Disambiguation margin | 0.18 | `entityResolutionCore.ts` |
| Fact direct/implied/speculative | 0.9 / 0.7 / 0.5 | `entityFactsService.ts` |
| Defer single first name | 1 mention | `shouldDeferCharacterPromotion` |

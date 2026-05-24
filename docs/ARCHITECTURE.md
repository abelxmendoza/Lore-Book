# Lore Keeper — Architecture

Generated from codebase on 2026-05-24. Describes the live system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Layer Map](#layer-map)
4. [Mode Router](#mode-router)
5. [Memory Pipeline](#memory-pipeline)
6. [Compiler / IR System](#compiler--ir-system)
7. [Vector & RAG System](#vector--rag-system)
8. [Engine System](#engine-system)
9. [Background Jobs](#background-jobs)
10. [Frontend Architecture](#frontend-architecture)
11. [Table Domain Map](#table-domain-map)
12. [Service Directory](#service-directory)

---

## System Overview

Lore Keeper is a **personal cognitive architecture** — a long-running AI system that ingests conversational input, extracts structured memory, and surfaces insights across identity, relationships, narrative, and behavior.

It is not a simple CRUD app with an AI chat bolt-on. Every message passes through a classification, ingestion, and compilation pipeline that writes to ~283 structured tables. The AI layer is a provider (OpenAI) sitting on top of infrastructure that operates independently.

```
User Input
    ↓
Mode Classification (modeRouterService)
    ↓
RAG Retrieval (vector + BM25 + reranking)
    ↓
OpenAI / Fallback Response
    ↓
Async Ingestion Pipeline
    ↓
IR Compilation → 283-table schema
    ↓
Background Engines → Insights, graphs, analysis
    ↓
Frontend Surfaces (Chat, Timeline, Books, Memory Explorer)
```

**Local stack (as of 2026-05-24):**
- API: `http://127.0.0.1:54321`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio: `http://127.0.0.1:54323`
- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

---

## Request Lifecycle

Trace of `POST /api/chat/stream`:

| Step | File | What Happens |
|------|------|-------------|
| 1. HTTP in | `apps/server/src/routes/chat.ts` | Zod validation (`chatSchema`), `optionalAuth`, rate limit |
| 2. Orchestration | `services/omegaChatService.ts` → `chatStream()` | Main entry point, coordinates all downstream |
| 3. Mode routing | `services/modeRouter/modeRouterService.ts` → `routeMessage()` | Classify message into 8 modes |
| 4. Mode handler | `services/modeRouter/modeHandlers.ts` → `handleMode()` | Mode-specific logic (recall, ingestion, emotional, etc.) |
| 5. RAG retrieval | `services/rag/multiVectorRetrieval.ts` → `retrieve()` | Vector + BM25 search, rerank, compress |
| 6. Prompt build | `services/omegaChatService.ts` | Assemble system prompt + memory context |
| 7. OpenAI call | `lib/openai.ts` | Stream `chat.completions.create()` |
| 8. SSE stream | `routes/chat.ts` | Write `data: {type, content}` chunks to client |
| 9. Async ingest | `services/conversationCentered/ingestionPipelineClass.ts` | Fire-and-forget: normalize → extract → compile → write |

Non-streaming endpoint (`POST /api/chat`) follows the same path via `omegaChatService.chat()`, returns JSON instead of SSE.

**Dev fallback path** (when `DEV_AI_FALLBACK=true` and OpenAI errors):  
`services/devFallbackService.ts` → `streamFallbackResponse()` — skips steps 6–7, returns labelled fake response. Both endpoints covered.

---

## Layer Map

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (apps/web/src/)                               │
│  React 18 + Vite • Supabase auth • 20+ surfaces        │
└────────────────────────┬────────────────────────────────┘
                         │ fetch /api/*
┌────────────────────────▼────────────────────────────────┐
│  RUNTIME LAYER (apps/server/src/)                       │
│  Express • Helmet • CSRF • Rate limit • Auth middleware │
│  145 routes • Schema guard • Audit log                  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  ORCHESTRATION LAYER                                    │
│  omegaChatService • modeRouterService • modeHandlers    │
│  intentDetection • entityAmbiguity • correctionService  │
└──────────┬─────────────────────────┬────────────────────┘
           │                         │
┌──────────▼──────────┐   ┌──────────▼──────────────────┐
│  RETRIEVAL LAYER    │   │  INGESTION LAYER             │
│  multiVectorRetrieval│  │  ingestionPipelineClass      │
│  bm25Search         │   │  ingestionQueue              │
│  reranker           │   │  normalizationService        │
│  contextCompressor  │   │  semanticExtractionService   │
│  ragPacketCache     │   │  eventAssemblyService        │
└──────────┬──────────┘   └──────────┬───────────────────┘
           │                         │
┌──────────▼─────────────────────────▼───────────────────┐
│  COMPILER / IR LAYER                                    │
│  irCompiler • incrementalCompiler                       │
│  dependencyGraph • memoryConsolidationService           │
│  EntryIR: knowledge_type + canon + entities + emotions  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  MEMORY LAYER (Supabase Postgres + pgvector)            │
│  283 tables • HNSW indexes • RLS per user               │
│  entry_ir • memory_components • omega_* • events • ...  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  ENGINE LAYER (background)                              │
│  40+ engines • DAG execution • 24h result cache         │
│  identityCore • archetype • narrative • prediction ...  │
└─────────────────────────────────────────────────────────┘
```

---

## Mode Router

**Files:** `services/modeRouter/modeRouterService.ts`, `modeHandlers.ts`, `responseFormatter.ts`

Every message is classified before any retrieval or generation happens.

### Modes

| Mode | Description | Handler |
|------|-------------|---------|
| `EMOTIONAL_EXISTENTIAL` | Fears, insecurities, existential thoughts | Empathetic response, no recall |
| `MEMORY_RECALL` | Factual queries ("what did I eat?") | RAG retrieval → specific facts |
| `NARRATIVE_RECALL` | Story queries ("what happened with X?") | Narrative graph → story |
| `EXPERIENCE_INGESTION` | Lived experiences with context | Parse + queue ingestion |
| `ACTION_LOG` | Atomic verb-forward moments ("I froze") | Immediate write |
| `NEEDS_CLARIFICATION` | Ambiguous milestones | Ask before ingesting |
| `MIXED` | Requires disambiguation | Blend handlers |
| `UNKNOWN` | Can't classify | Falls through to general chat |

### Routing Process

```
routeMessage(userId, message, conversationHistory)
├─ quickModeCheck()  [<50ms — regex patterns, heuristics]
│  └─ If confidence ≥ 0.8 → return immediately
└─ llmModeCheck()    [<250ms — OpenAI classification]
   └─ combineChecks() → ModeRoutingResult { mode, confidence, reasoning }
```

---

## Memory Pipeline

**File:** `services/conversationCentered/ingestionPipelineClass.ts` → `ConversationIngestionPipeline`

Triggered asynchronously after every chat message (fire-and-forget via `ingestionQueue`).

```
Raw message text
    ↓ normalizationService.normalize()
Cleaned text + sentences
    ↓ semanticExtractionService.extract()
Semantic units (facts, events, relationships, claims)
    ↓ entityRelationshipDetector.detectRelationships()
Entity refs with confidence + role
    ↓ eventAssemblyService.assembleEvents()
    ↓ multiEventSplittingService.splitEvents()
Discrete events (compound events split)
    ↓ correctionResolutionService.resolveCorrections()
Deduplicated / corrected events
    ↓ irCompiler.compileEntry()
EntryIR { knowledge_type, canon, entities, emotions, themes, confidence }
    ↓ DB writes (see below)
```

### Primary Tables Written

```
conversation_messages       ← root record
├─ extracted_units          ← semantic units
├─ utterances               ← original text
├─ entry_ir                 ← compiled IR (core of the memory system)
├─ events / event_records   ← factual events
├─ emotion_events           ← emotion extraction
├─ entity_mentions          ← entity references
├─ omega_entities            ← claim-based entity model
├─ omega_claims             ← entity claims
├─ omega_relationships      ← relationship claims
├─ omega_evidence           ← claim evidence
├─ behavior_events          ← behavioral signals
├─ goal_signals / value_signals / belief_signals
├─ habit_mentions / skill_relationships
└─ [+ async enrichment: conflict detection, knowledge graph, RL signals]
```

---

## Compiler / IR System

**Files:** `services/compiler/irCompiler.ts`, `incrementalCompiler.ts`, `dependencyGraph.ts`, `memoryConsolidationService.ts`

The IR (Intermediate Representation) is a **structured, reasoned form** of each message — not raw text, not a simple embedding. It's what the memory system actually operates on.

### EntryIR Shape

```typescript
{
  knowledge_type: 'EXPERIENCE' | 'FEELING' | 'BELIEF' | 'FACT' | 'DECISION' | 'QUESTION'
  
  canon: {
    status: 'CANON' | 'ROLEPLAY' | 'HYPOTHETICAL' | 'FICTIONAL' | 'THOUGHT_EXPERIMENT' | 'META'
    confidence: number   // 0.0–1.0
  }
  
  entities:  EntityRef[]     // { entity_id, mention_text, confidence, role }
  emotions:  EmotionSignal[] // { emotion, intensity, confidence }
  themes:    ThemeSignal[]   // { theme, confidence }
  
  certainty_source: 'DIRECT_EXPERIENCE' | 'INFERENCE' | 'HEARSAY' | 'VERIFICATION' | 'MEMORY_RECALL'
  
  compiler_flags: {
    is_dirty: boolean
    compilation_version: number
    downgraded_from_fact?: boolean
    promoted_from_feeling?: boolean
  }
}
```

### Incremental Compilation

When an entry is corrected:
1. `dependencyGraph.getAffectedEntries(changedIds)` — transitive closure
2. Recompile each affected entry (fast — no LLM, just re-extract from cached services)
3. Update `compiler_flags.compilation_version++`, `is_dirty = false`

### Memory Consolidation

`memoryConsolidationService` rolls up related `entry_ir` records into `memory_components` — the primary target for RAG retrieval.

---

## Vector & RAG System

**Files:** `services/rag/`, `services/embeddingService.ts`

### Embedding Generation

```
text → embeddingCacheService.getCachedEmbedding()
     → cache miss → openai.embeddings.create({ model: 'text-embedding-3-small' })
     → 1536-dim vector stored in embeddings_cache + target table column
```

### Vector Tables (pgvector HNSW)

| Table | Column | Used For |
|-------|--------|---------|
| `memory_components` | `embedding vector(1536)` | Primary RAG retrieval |
| `omega_claims` | `embedding vector(1536)` | Claim similarity search |
| `journal_entries` | `embedding vector(1536)` | Entry search |
| `characters` | `embedding vector(1536)` | Character similarity |
| `events` | `embedding vector(1536)` | Event search |
| `engine_embeddings` | `embedding vector(1536)` | Engine semantic search |

### RAG Pipeline

```
query string
    ↓ intentRouter.parseIntent()      classify query type
    ↓ queryRewriter.expand()           synonyms, temporal variants
    ↓ multiVectorRetrieval.retrieve()
    │   ├─ Vector search (cosine): embedding <-> query_vec ORDER BY LIMIT K
    │   └─ BM25 search: keyword fallback
    ↓ reranker.rerank()               cross-encoder scoring, top-K
    ↓ entityRelationshipBoosting()    boost results with related entities
    ↓ contextCompressor.compress()    fit to token budget
    → memory context for prompt
```

---

## Engine System

**Files:** `src/engineRuntime/engineRegistry.ts`, `orchestrator.ts`, `types.ts`

Engines are **specialized analyzers** that run over accumulated user data and produce insights. ~40 engines registered.

### Engine Execution

```
engineOrchestrator.runAll(userId)
    ↓ Load EngineContext (entries, relationships, events, entities...)
    ↓ Build execution DAG from engine_dependencies table
    ↓ Run engines in dependency order, max 3 concurrent
    ↓ Cache results in engine_results (TTL: 24h)
    → Return EngineResults
```

### Engine Categories

| Category | Examples |
|----------|---------|
| **Identity** | identityCore, archetype, personality, innerMythology, alternateSelf |
| **Memory** | omegaMemory, memoryReview, correctionDashboard |
| **Cognitive** | distortion, cognitiveBias, beliefReality, contradiction |
| **Emotional** | emotionalIntelligence, resilience, innerDialogue |
| **Temporal** | chronology, continuity, narrativeDiff, backwardStorytelling |
| **Social** | socialNetwork, relationshipDynamics, influence, socialProjection |
| **Growth** | habits, goals, values, decisions, learning, growth |
| **Health** | health, financial, time |
| **Generation** | biography, memoir, recommendations, predictions, insights |

### Engine API

```
GET  /api/engine-runtime/summary          run all + return results
GET  /api/engine-runtime/summary/cached   cached results only
POST /api/engine-runtime/run/:engineName  run single engine
GET  /api/engine-runtime/health           health status
```

---

## Background Jobs

**Directory:** `apps/server/src/jobs/`

| Job | Schedule | Purpose |
|-----|----------|---------|
| `memoryExtractionWorker` | Continuous | Consolidate `entry_ir` → `memory_components` |
| `insightGenerationJob` | Daily 2:30 AM | Run insight engines, cache findings |
| `graphUpdateJob` | Sundays 3 AM | Refresh knowledge graph, relationship network |
| `continuityEngineJob` | Daily 3 AM | Detect contradictions, narrative gaps |
| `valueEvolutionJob` | Daily 4 AM | Track value priority shifts |
| `evolveRelationshipsJob` | Sundays 2 AM | Detect relationship lifecycle events |
| `episodicClosureJob` | Sundays 3 AM | Suggest chapter closures |
| `personalStrategyTrainingJob` | Sundays 2 AM | Update RL policy from decision outcomes |
| `syncJob` | Periodic | Pull external integrations (GitHub, etc.) |
| `runEmbeddingReindex` | Manual | Rebuild all embeddings + HNSW index |

---

## Frontend Architecture

**Root:** `apps/web/src/`

### Key Surfaces

| Route | Component | Description |
|-------|-----------|-------------|
| `/` or `/chat` | `ChatFirstInterface` | Primary interface — conversational input |
| `/timeline` | `OmniTimelinePanel` | Temporal event visualization |
| `/memories` | `MemoryExplorer` | Browse memory components |
| `/characters` | `CharacterBook` | People entity book |
| `/locations` | `LocationBook` | Places entity book |
| `/memoir` | `BiographyEditor` | AI-generated biography |
| `/events` | `EventsBook` | Structured event explorer |
| `/entities` | `EntityResolutionBook` | Entity deduplication UI |
| `/quests` | `QuestBoard` | Goal/quest tracking |
| `/love` | `LoveAndRelationshipsView` | Relationship health |
| `/gaps` | `KnowledgeGapDashboard` | Unknown/missing knowledge |

### Chat → Backend Connection

```typescript
// POST /api/chat/stream  (SSE)
{
  message: string,
  conversationHistory: { role, content }[],
  entityContext?: { type, id },     // pin chat to a character/location/etc.
  currentContext?: { kind, timelineNodeId, threadId },
  soulProfileContext?: { lastReferencedInsightId }
}

// Response: SSE chunks
data: { type: 'metadata', data: { response_mode, sources, ... } }
data: { type: 'chunk', content: '...' }
data: { type: 'done' }
```

### State

- **Auth:** `useAuth()` — Supabase session
- **Data:** `useLoreKeeper()` — entries, chapters, timeline
- **Tasks:** `useTaskEngine()` — quests, tasks
- **Mock:** `useMockData()` — demo mode toggle

---

## Table Domain Map

283 public tables grouped by domain.

### Identity (~15 tables)
`identity_core_profiles`, `identity_dimensions`, `identity_dimension_signals`, `identity_signals`, `identity_conflicts`, `archetype_profiles`, `archetype_distortions`, `personality_traits`, `inner_myths`, `myth_archetypes`, `myth_elements`, `identity_signal_memory_component_links`

### Memory & Knowledge (~30 tables)
`conversation_messages`, `conversation_sessions`, `conversation_compactions`, `utterances`, `extracted_units`, `event_unit_links`, `entry_ir`, `entry_dependencies`, `entry_thread_links`, `memory_components`, `memory_reliability_scores`, `omega_entities`, `omega_claims`, `omega_relationships`, `omega_evidence`, `fact_claims`, `fact_verifications`, `embeddings_cache`, `knowledge_units`, `perspective_claims`, `profile_claims`

### Events & Timeline (~35 tables)
`events`, `event_records`, `event_mentions`, `event_emotions`, `event_impacts`, `event_causal_links`, `event_continuity_links`, `event_confidence_snapshots`, `timeline_links`, `timelines`, `timeline_arcs`, `timeline_sagas`, `timeline_eras`, `timeline_epochs`, `timeline_scenes`, `timeline_actions`, `timeline_microactions`, `temporal_edges`, `chapters`, `continuity_events`, `resolved_events`, `narrative_accounts`, `narratives`, `narrative_diffs`

### Relationships & Social (~35 tables)
`characters`, `locations`, `entities`, `entity_relationships`, `romantic_relationships`, `romantic_interactions`, `relationship_trees`, `relationship_dynamics`, `relationship_analytics`, `relationship_snapshots`, `relationship_breakups`, `relationship_cycles`, `group_relationships`, `social_nodes`, `social_edges`, `social_projections`, `social_communities`, `person_influence`, `influence_scores`, `entity_attributes`, `entity_scopes`, `entity_symbols`

### Cognitive & Emotional (~40 tables)
`emotion_events`, `emotion_mentions`, `emotional_patterns`, `eq_insights`, `belief_signals`, `belief_evolutions`, `belief_resolutions`, `conflicts`, `insecurity_patterns`, `insecurity_instances`, `trigger_events`, `recovery_events`, `thought_classifications`, `thought_responses`, `bias_detections`, `value_signals`, `reflection_insights`, `contradiction_alerts`, `identity_conflicts`

### Goals, Values & Growth (~30 tables)
`goals`, `goal_signals`, `values`, `value_rankings`, `value_evolution_events`, `decisions`, `decision_insights`, `growth_signals`, `growth_trajectory_points`, `habits`, `behavior_events`, `behavior_loops`, `skill_relationships`, `skill_clusters`, `skill_progress`, `learning_records`, `activities`, `actions`, `interventions`

### Health, Wellness & Lifestyle (~25 tables)
`sleep_events`, `symptom_events`, `biometric_measurements`, `energy_events`, `workout_events`, `health_insights`, `wellness_scores`, `financial_transactions`, `spending_patterns`, `financial_scores`, `income_trends`, `time_events`, `time_blocks`, `time_scores`, `flow_states`, `procrastination_signals`, `setbacks`

### Creative & Expression (~15 tables)
`creative_events`, `creative_blocks`, `creative_insights`, `inspiration_sources`, `project_lifecycles`, `dream_signals`, `paracosm_worlds`, `paracosm_elements`, `quests`, `quest_chains`, `quest_achievements`, `achievements`

### Narrative & Meaning (~15 tables)
`narrative_diffs`, `narrative_accounts`, `meaning_emergence`, `legacy_signals`, `legacy_trajectory_points`, `scenes`, `memoir_outlines`, `original_documents`, `publication_versions`, `storyof_self_snapshots`

### System & Governance (~15 tables)
`chat_messages`, `engine_manifest`, `engine_blueprints`, `engine_embeddings`, `engine_results`, `engine_health`, `engine_dependencies`, `entry_verifications`, `correction_records`, `contradiction_reviews`, `consent_records`, `training_datasets`, `user_corrections`, `meta_overrides`, `mode_router_events`

---

## Service Directory

Quick reference — domain → key files.

| Domain | Key Services |
|--------|-------------|
| **Chat orchestration** | `omegaChatService.ts`, `routes/chat.ts` |
| **Mode routing** | `modeRouter/modeRouterService.ts`, `modeHandlers.ts` |
| **Ingestion** | `conversationCentered/ingestionPipelineClass.ts`, `ingestion/ingestionQueue.ts` |
| **Compiler** | `compiler/irCompiler.ts`, `incrementalCompiler.ts`, `dependencyGraph.ts` |
| **Memory** | `memoryService.ts`, `omegaMemoryService.ts`, `compiler/memoryConsolidationService.ts` |
| **Retrieval** | `rag/multiVectorRetrieval.ts`, `rag/reranker.ts`, `rag/contextCompressor.ts` |
| **Embeddings** | `embeddingService.ts`, `ragPacketCacheService.ts` |
| **Recall** | `memoryRecall/memoryRecallEngine.ts`, `memoryRecall/recallDetector.ts` |
| **Identity** | `identityCore/`, `archetype/`, `personality/`, `innerMythology/` |
| **Emotions** | `emotion/`, `emotionalIntelligence/`, `distortion/`, `cognitiveBias/` |
| **Temporal** | `timeEngine.ts`, `chronology/`, `continuityService.ts` |
| **Narrative** | `narrative/`, `backwardStorytelling/`, `storyOfSelf/` |
| **Social** | `social/`, `relationshipDynamics/`, `influence/`, `peoplePlacesService.ts` |
| **Goals/Values** | `goals/`, `values/`, `decisions/`, `habitsEngine.ts` |
| **Engines** | `engineRuntime/engineRegistry.ts`, `engineRuntime/orchestrator.ts` |
| **RL** | `reinforcementLearning/chatPersonaRL.ts` |
| **Auth/Security** | `middleware/auth.ts`, `middleware/schemaGuard.ts`, `utils/securityCheck.ts` |
| **Dev** | `devFallbackService.ts`, `db/schemaVerification.ts` |

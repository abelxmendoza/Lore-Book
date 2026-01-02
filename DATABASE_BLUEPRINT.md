# LORE KEEPER DATABASE BLUEPRINT (CORRECTED & EXPANDED ERD SPEC)

====================================================

**Version**: 2.0 (Corrected from Original Conceptual Spec)  
**Last Updated**: Based on migration files through 2025-11-18  
**Database**: PostgreSQL with pgvector extension

## OVERVIEW

This document provides a comprehensive and accurate database schema specification for Lore Keeper, corrected from the original conceptual blueprint to match the actual implementation. The schema supports:

- Multi-level timeline hierarchy (9 layers)
- Character relationship graphs
- Semantic search via vector embeddings
- Task management with timeline integration
- Truth verification system
- Subscription management
- Psychological profiling (essence profiles)
- Memoir generation

## TERMINOLOGY CLARIFICATION

### Memories vs Journal Entries

**Important Distinction**: The codebase uses "memory" as a conceptual term, but the database table is `journal_entries`.

- **Journal Entries** (`journal_entries` table): The actual database table storing individual memory records. This is the single source of truth for all individual memories in the system.

- **MemoryEntry** (TypeScript type): Type definition representing a journal entry in the application layer (`apps/server/src/types.ts`).

- **MemoryBlock** (Conceptual): Normalized format used during ingestion/processing (from CODEX blueprint). This is a processing concept, NOT a database table. All inputs (manual entries, photos, GitHub commits, etc.) are normalized into MemoryBlocks during ingestion, then stored as `journal_entries`.

- **Memory Fabric** (In-memory graph): Graph structure connecting entities (events, characters, arcs, tasks, insights) for semantic relationships. This is an in-memory data structure (`lorekeeper/memory_fabric.py`), NOT a database table.

- **Character Memories** (`character_memories` table): Join table linking characters to journal entries, capturing how characters appear within specific entries.

- **Memories** (Conceptual term): Used throughout code/comments to refer to journal entries conceptually. In database terms, these are `journal_entries`.

**Key Point**: There is NO separate "memories" table in the database. All individual memories are stored as `journal_entries`. The term "memory" is used conceptually in the codebase (MemoryEntry type, MemoryBlock processing format, Memory Fabric graph), but the database implementation uses `journal_entries` as the single source of truth for individual memory records.

**Summary**: 
- Database table = `journal_entries` (stores all individual memories)
- Conceptual term = "memories" (used in code/types/comments)
- Processing format = MemoryBlock (normalized ingestion format)
- Graph structure = Memory Fabric (in-memory semantic graph)

### What Constitutes a Journal Entry?

**Current Implementation**:
- **One-to-One Mapping**: Currently, each journal entry represents a single atomic memory/event
- **Chat Messages**: Each chat message that passes `shouldPersistMessage()` check (contains keywords like "save this", "log", "remember", "note") becomes its own separate journal entry
- **Conversation History**: Chat services maintain `conversationHistory` arrays for AI context, but these are **NOT stored** as database records - only individual user messages that should be persisted become entries

**Current Entry Structure**:
- One `content` field (TEXT) - single piece of text
- One `date` (TIMESTAMPTZ) - when the entry occurred
- One `source` - where it came from ('manual', 'chat', 'photo', etc.)
- `metadata` (JSONB) - can store flexible context including conversation references

**Conceptual Gap - Multiple Memories Per Entry**:
While the current implementation stores one memory per entry, there's a conceptual need for:
- **Conversation Sessions**: Multiple back-and-forth chat messages that form a cohesive conversation might conceptually be "one memory" but are currently stored as separate entries
- **Composite Memories**: A single journal entry might conceptually contain multiple related memories (e.g., "Today I did X, Y, and Z" - three memories in one entry)
- **Grouped Events**: Related events that happened together might be better represented as a single entry with multiple memory components

**Current Workaround**:
- The `metadata` JSONB field can store conversation context, related message IDs, or other grouping information
- Entries can be linked via `character_memories`, `task_memory_bridges`, or semantic similarity
- Tags and chapters can group related entries

**Future Considerations**:
- A `conversation_sessions` table could group related chat messages
- A `memory_components` table could store atomic memories within a journal entry
- The `metadata` field could be expanded to store structured conversation data
- Entry relationships could be more explicitly modeled for multi-memory entries

---

## CORE ENTITIES

### 1. User (auth.users - Supabase Auth)
   - **id** (PK, UUID) - Primary key, references auth.users
   - **Note**: User authentication handled by Supabase Auth; user_id appears as FK in all user-scoped tables

### 2. Journal Entries (journal_entries)
   - **id** (PK, UUID) - Primary key, default gen_random_uuid()
   - **user_id** (FK → auth.users.id) - Owner of the entry
   - **date** (TIMESTAMPTZ) - When the entry occurred, default now()
   - **content** (TEXT) - Main entry text, NOT NULL
     - **Note**: Currently stores single atomic memory/event. For chat, each persisted message becomes its own entry.
   - **tags** (TEXT[]) - Array of tags, default '{}'
   - **chapter_id** (FK → chapters.id, nullable) - Optional chapter association
   - **mood** (TEXT, nullable) - Mood indicator
   - **summary** (TEXT, nullable) - AI-generated summary
   - **source** (TEXT) - Source type: 'manual', 'chat', 'api', 'system', 'photo', 'calendar', 'x', default 'manual'
     - **Note**: 'chat' entries are created when user messages contain persistence keywords ("save this", "log", "remember", "note")
   - **embedding** (VECTOR(1536), nullable) - Semantic embedding for search
   - **verification_status** (TEXT) - 'verified', 'unverified', 'contradicted', 'ambiguous', default 'unverified'
   - **year_shard** (INTEGER) - Year extracted for partitioning/performance
   - **metadata** (JSONB) - Flexible metadata storage, default '{}'
     - **Common metadata fields**:
       - `autoCaptured` (boolean) - Whether entry was auto-captured from chat
       - `conversationHistory` (array, not stored) - Used in-memory for AI context only
       - `extractedDates` (array) - Dates extracted from content
       - `connections` (number) - Count of related entries
       - `hasContinuityWarnings` (boolean) - Whether contradictions detected
       - `relationships` (array) - Character/entity relationships
       - `fabricLinks` (array) - Memory Fabric graph links
       - `references` (array) - References to other entries
     - **Potential for conversation grouping**: Could store `conversation_id`, `session_id`, `related_message_ids` for grouping chat messages
   - **created_at** (TIMESTAMPTZ) - Creation timestamp, default now()
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp, default now()

   **Indexes**:
   - journal_entries_user_id_idx (user_id)
   - journal_entries_date_idx (date DESC)
   - journal_entries_chapter_id_idx (chapter_id)
   - journal_entries_tags_idx (GIN on tags array)
   - journal_entries_embedding_idx (IVFFlat on embedding vector)
   - journal_entries_year_shard_idx (year_shard)

### 3. Chapters (chapters)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **title** (TEXT) - Chapter title, NOT NULL
   - **start_date** (TIMESTAMPTZ) - Chapter start, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - Chapter end
   - **description** (TEXT, nullable) - Chapter description
   - **summary** (TEXT, nullable) - Chapter summary
   - **parent_id** (FK → timeline_arcs.id, nullable) - Links to timeline arc (added in timeline hierarchy migration)
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Indexes**:
   - chapters_user_id_idx (user_id)
   - chapters_start_date_idx (start_date DESC)
   - chapters_parent_id_idx (parent_id)

### 4. Characters (characters)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **name** (TEXT) - Character name, NOT NULL
   - **alias** (TEXT[]) - Array of alternate names/titles
   - **pronouns** (TEXT, nullable) - Pronoun preference
   - **archetype** (TEXT, nullable) - Story archetype (mentor, rival, companion, etc.)
   - **role** (TEXT, nullable) - Character role
   - **status** (TEXT) - 'active' or other status, default 'active'
   - **first_appearance** (DATE, nullable) - First appearance date
   - **summary** (TEXT, nullable) - Character summary
   - **tags** (TEXT[]) - Character tags, default '{}'
   - **embedding** (VECTOR(1536), nullable) - Semantic embedding
   - **avatar_url** (TEXT, nullable) - URL to avatar image (DiceBear or Supabase storage)
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, name) - One character per name per user

   **Indexes**:
   - characters_user_id_idx (user_id)
   - characters_name_idx (name)

### 5. Character Relationships (character_relationships)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **source_character_id** (FK → characters.id) - Source character
   - **target_character_id** (FK → characters.id) - Target character
   - **relationship_type** (TEXT) - Type of relationship, NOT NULL
   - **closeness_score** (SMALLINT) - Score from -10 to 10
   - **status** (TEXT) - 'active' or other, default 'active'
   - **summary** (TEXT, nullable) - Relationship summary
   - **last_shared_memory_id** (FK → journal_entries.id, nullable) - Last shared memory reference
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, source_character_id, target_character_id, relationship_type)

   **Indexes**:
   - character_relationships_user_id_idx (user_id)
   - character_relationships_source_idx (source_character_id)
   - character_relationships_target_idx (target_character_id)

### 6. Character Memories (character_memories)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **character_id** (FK → characters.id) - Character reference
   - **journal_entry_id** (FK → journal_entries.id) - Entry reference
   - **chapter_id** (FK → chapters.id, nullable) - Optional chapter reference
   - **role** (TEXT, nullable) - Character's role in this memory
   - **emotion** (TEXT, nullable) - Emotional state
   - **perspective** (TEXT, nullable) - Narrative perspective
   - **summary** (TEXT, nullable) - Memory summary
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, character_id, journal_entry_id)

   **Indexes**:
   - character_memories_user_id_idx (user_id)
   - character_memories_character_id_idx (character_id)
   - character_memories_entry_id_idx (journal_entry_id)

---

## TIMELINE HIERARCHY (9 Levels)

The timeline system provides a 9-layer hierarchy for organizing memories across different scales of time and narrative structure.

### Hierarchy Structure:
```
Mythos (top level)
  └─ Epochs
      └─ Eras
          └─ Sagas
              └─ Arcs
                  └─ Chapters
                      └─ Scenes
                          └─ Actions
                              └─ MicroActions
```

### 7. Timeline Mythos (timeline_mythos)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **title** (TEXT) - Mythos title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 8. Timeline Epochs (timeline_epochs)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_mythos.id) - Parent mythos
   - **title** (TEXT) - Epoch title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 9. Timeline Eras (timeline_eras)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_epochs.id) - Parent epoch
   - **title** (TEXT) - Era title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 10. Timeline Sagas (timeline_sagas)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_eras.id) - Parent era
   - **title** (TEXT) - Saga title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 11. Timeline Arcs (timeline_arcs)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_sagas.id) - Parent saga
   - **title** (TEXT) - Arc title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Note**: Chapters link to Arcs via `chapters.parent_id`

### 12. Timeline Scenes (timeline_scenes)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → chapters.id) - Parent chapter
   - **title** (TEXT) - Scene title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 13. Timeline Actions (timeline_actions)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_scenes.id) - Parent scene
   - **title** (TEXT) - Action title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 14. Timeline MicroActions (timeline_microactions)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **parent_id** (FK → timeline_actions.id) - Parent action
   - **title** (TEXT) - MicroAction title, NOT NULL
   - **description** (TEXT, nullable) - Description
   - **start_date** (TIMESTAMPTZ) - Start date, NOT NULL
   - **end_date** (TIMESTAMPTZ, nullable) - End date
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **source_type** (TEXT) - 'import', 'manual', or 'ai', default 'manual'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

### 15. Timeline Search Index (timeline_search_index)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **layer_type** (TEXT) - Layer type: 'mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'microaction'
   - **layer_id** (UUID) - ID of the layer entity
   - **search_text** (TEXT) - Full-text searchable content, NOT NULL
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp

   **Indexes**:
   - timeline_search_index_user_id_idx (user_id)
   - timeline_search_index_layer_idx (layer_type, layer_id)
   - timeline_search_index_text_idx (GIN on search_text tsvector)
   - timeline_search_index_tags_idx (GIN on tags)

---

## TASK SYSTEM

### 16. Tasks (tasks)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **title** (TEXT) - Task title, NOT NULL
   - **description** (TEXT, nullable) - Task description
   - **category** (TEXT) - Task category, default 'admin'
   - **intent** (TEXT, nullable) - User intent
   - **source** (TEXT) - Source: 'manual' or external source, default 'manual'
   - **status** (TEXT) - Status: 'incomplete', 'complete', etc., default 'incomplete'
   - **priority** (INTEGER) - Priority score, default 3
   - **urgency** (INTEGER) - Urgency score, default 1
   - **impact** (INTEGER) - Impact score, default 1
   - **effort** (INTEGER) - Effort estimate, default 0
   - **due_date** (TIMESTAMPTZ, nullable) - Due date
   - **external_id** (TEXT, nullable) - External system ID
   - **external_source** (TEXT, nullable) - External system name
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, external_source, external_id)

   **Indexes**:
   - tasks_user_status_idx (user_id, status)
   - tasks_due_idx (user_id, due_date)
   - tasks_due_date_idx (due_date)
   - tasks_priority_idx (priority)
   - tasks_created_at_idx (created_at)
   - task_category_idx (category)

### 17. Task Events (task_events)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **task_id** (FK → tasks.id) - Task reference
   - **event_type** (TEXT) - Event type, NOT NULL
   - **description** (TEXT, nullable) - Event description
   - **created_at** (TIMESTAMPTZ) - Event timestamp, default now()
   - **metadata** (JSONB) - Flexible metadata, default '{}'

   **Indexes**:
   - task_events_user_idx (user_id, created_at DESC)
   - task_events_task_idx (task_id)

### 18. Task Sync State (task_sync_state)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **provider** (TEXT) - External provider name, NOT NULL
   - **last_cursor** (TEXT, nullable) - Last sync cursor
   - **last_synced_at** (TIMESTAMPTZ, nullable) - Last sync timestamp
   - **status** (TEXT) - Sync status, default 'idle'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, provider)

### 19. Timeline Events (timeline_events)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **task_id** (FK → tasks.id, nullable) - Optional task reference
   - **title** (TEXT) - Event title, NOT NULL
   - **description** (TEXT, nullable) - Event description
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **occurred_at** (TIMESTAMPTZ) - When event occurred, default now()
   - **context** (JSONB) - Event context, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Indexes**:
   - timeline_events_user_idx (user_id, occurred_at DESC)
   - timeline_events_task_idx (task_id)

### 20. Task Memory Bridges (task_memory_bridges)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **task_id** (FK → tasks.id) - Task reference
   - **timeline_event_id** (FK → timeline_events.id, nullable) - Optional timeline event
   - **journal_entry_id** (FK → journal_entries.id, nullable) - Optional journal entry
   - **bridge_type** (TEXT) - Bridge type, default 'task_timeline'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp

   **Indexes**:
   - task_memory_bridges_user_idx (user_id, created_at DESC)
   - task_memory_bridges_task_idx (task_id)
   - task_memory_bridges_timeline_idx (timeline_event_id)

---

## VERIFICATION SYSTEM (Truth Seeker)

### 21. Fact Claims (fact_claims)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **entry_id** (FK → journal_entries.id) - Source entry
   - **claim_type** (TEXT) - Type: 'date', 'location', 'character', 'event', 'relationship', 'attribute', 'other', NOT NULL
   - **subject** (TEXT) - Claim subject, NOT NULL
   - **attribute** (TEXT) - Claim attribute, NOT NULL
   - **value** (TEXT) - Claim value, NOT NULL
   - **confidence** (FLOAT) - Extraction confidence (0-1), default 0.5
   - **extracted_at** (TIMESTAMPTZ) - Extraction timestamp, default now()
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **UNIQUE** (user_id, entry_id, subject, attribute, value)

   **Indexes**:
   - fact_claims_user_id_idx (user_id)
   - fact_claims_entry_id_idx (entry_id)
   - fact_claims_subject_attribute_idx (user_id, subject, attribute)
   - fact_claims_claim_type_idx (claim_type)
   - fact_claims_user_entry_idx (user_id, entry_id)
   - fact_claims_lookup_idx (user_id, subject, attribute, value)

### 22. Entry Verifications (entry_verifications)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **entry_id** (FK → journal_entries.id) - Entry reference
   - **verification_status** (TEXT) - 'verified', 'unverified', 'contradicted', 'ambiguous', NOT NULL
   - **verified_at** (TIMESTAMPTZ) - Verification timestamp, default now()
   - **verified_by** (TEXT) - 'system' or 'user', default 'system'
   - **confidence_score** (FLOAT, nullable) - Confidence score (0-1)
   - **evidence_count** (INTEGER) - Supporting evidence count, default 0
   - **contradiction_count** (INTEGER) - Contradiction count, default 0
   - **supporting_entries** (JSONB) - Array of supporting entry IDs, default '[]'
   - **contradicting_entries** (JSONB) - Array of contradicting entry IDs, default '[]'
   - **verification_report** (JSONB) - Detailed verification report, default '{}'
   - **resolved** (BOOLEAN) - Whether resolved, default false
   - **resolved_at** (TIMESTAMPTZ, nullable) - Resolution timestamp
   - **resolution_notes** (TEXT, nullable) - Resolution notes
   - **metadata** (JSONB) - Flexible metadata, default '{}'

   **Indexes**:
   - entry_verifications_user_id_idx (user_id)
   - entry_verifications_entry_id_idx (entry_id)
   - entry_verifications_status_idx (user_id, verification_status)
   - entry_verifications_resolved_idx (user_id, resolved) WHERE resolved = false
   - entry_verifications_status_idx (user_id, verification_status, resolved)
   - entry_verifications_contradictions_idx (user_id, verification_status) WHERE verification_status IN ('contradicted', 'ambiguous') AND resolved = false

### 23. Fact Verifications (fact_verifications)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **fact_claim_id** (FK → fact_claims.id) - Fact claim reference
   - **verification_status** (TEXT) - 'verified', 'unverified', 'contradicted', 'ambiguous', NOT NULL
   - **verified_at** (TIMESTAMPTZ) - Verification timestamp, default now()
   - **verified_by** (TEXT) - 'system' or 'user', default 'system'
   - **confidence_score** (FLOAT, nullable) - Confidence score (0-1)
   - **supporting_facts** (JSONB) - Array of supporting fact_claim_ids, default '[]'
   - **contradicting_facts** (JSONB) - Array of contradicting fact_claim_ids, default '[]'
   - **evidence_summary** (TEXT, nullable) - Evidence summary
   - **metadata** (JSONB) - Flexible metadata, default '{}'

   **Indexes**:
   - fact_verifications_user_id_idx (user_id)
   - fact_verifications_fact_claim_id_idx (fact_claim_id)
   - fact_verifications_status_idx (user_id, verification_status)

---

## SUBSCRIPTION & USER MANAGEMENT

### 24. Subscriptions (subscriptions)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner, UNIQUE
   - **stripe_customer_id** (TEXT, nullable) - Stripe customer ID, UNIQUE
   - **stripe_subscription_id** (TEXT, nullable) - Stripe subscription ID, UNIQUE
   - **status** (subscription_status ENUM) - 'trial', 'active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', default 'free'
   - **plan_type** (plan_type ENUM) - 'free' or 'premium', default 'free'
   - **trial_ends_at** (TIMESTAMPTZ, nullable) - Trial end date
   - **current_period_start** (TIMESTAMPTZ, nullable) - Current period start
   - **current_period_end** (TIMESTAMPTZ, nullable) - Current period end
   - **cancel_at_period_end** (BOOLEAN) - Cancel at period end flag, default false
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Indexes**:
   - subscriptions_user_id_idx (user_id)
   - subscriptions_stripe_customer_id_idx (stripe_customer_id)
   - subscriptions_stripe_subscription_id_idx (stripe_subscription_id)
   - subscriptions_status_idx (status)
   - subscriptions_trial_ends_at_idx (trial_ends_at) WHERE trial_ends_at IS NOT NULL

### 25. Subscription Usage (subscription_usage)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **month** (DATE) - First day of month (YYYY-MM-01), NOT NULL
   - **entry_count** (INTEGER) - Entries created this month, default 0
   - **ai_requests_count** (INTEGER) - AI requests this month, default 0
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, month)

   **Indexes**:
   - subscription_usage_user_id_idx (user_id)
   - subscription_usage_month_idx (month)
   - subscription_usage_user_month_idx (user_id, month)

### 26. Terms Acceptance (terms_acceptance)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **version** (TEXT) - Terms version, NOT NULL, default '1.0'
   - **accepted_at** (TIMESTAMPTZ) - Acceptance timestamp, default now()
   - **ip_address** (TEXT, nullable) - IP address at acceptance
   - **user_agent** (TEXT, nullable) - User agent at acceptance
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **UNIQUE** (user_id, version)

   **Indexes**:
   - terms_acceptance_user_id_idx (user_id)
   - terms_acceptance_version_idx (version)
   - terms_acceptance_accepted_at_idx (accepted_at DESC)

### 27. Essence Profiles (essence_profiles)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner, UNIQUE
   - **profile_data** (JSONB) - Psychological insights data, NOT NULL, default '{}'
   - **version** (INTEGER) - Profile version, default 1
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Indexes**:
   - essence_profiles_user_id_idx (user_id)
   - essence_profiles_updated_at_idx (updated_at DESC)

---

## ADDITIONAL ENTITIES

### 28. Daily Summaries (daily_summaries)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **date** (DATE) - Summary date, NOT NULL
   - **summary** (TEXT, nullable) - Daily summary text
   - **tags** (TEXT[]) - Tags array, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **UNIQUE** (user_id, date)

   **Indexes**:
   - daily_summaries_user_date_idx (user_id, date DESC)

### 29. Memoir Outlines (memoir_outlines)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner, UNIQUE
   - **title** (TEXT) - Outline title, NOT NULL, default 'My Memoir'
   - **structure** (JSONB) - Outline structure, NOT NULL, default '{}'
   - **sections** (JSONB) - Sections array, default '[]'
   - **language_style** (JSONB, nullable) - Language style preferences
   - **auto_update** (BOOLEAN) - Auto-update flag, default true
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp

   **Indexes**:
   - memoir_outlines_user_id_idx (user_id)

### 30. Original Documents (original_documents)
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **title** (TEXT) - Document title, NOT NULL
   - **file_name** (TEXT) - Original filename, NOT NULL
   - **content** (TEXT) - Document content, NOT NULL
   - **source** (TEXT) - Source type, NOT NULL
   - **file_type** (TEXT, nullable) - File type
   - **language_style** (TEXT, nullable) - Language style
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **uploaded_at** (TIMESTAMPTZ) - Upload timestamp, default now()
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, file_name)

   **Indexes**:
   - original_documents_user_id_idx (user_id)
   - original_documents_source_idx (source)

### 31. People Places (people_places) - Legacy
   - **id** (PK, UUID) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **name** (TEXT) - Entity name, NOT NULL
   - **type** (TEXT) - 'person' or 'place', NOT NULL
   - **first_mentioned_at** (TIMESTAMPTZ, nullable) - First mention timestamp
   - **last_mentioned_at** (TIMESTAMPTZ, nullable) - Last mention timestamp
   - **total_mentions** (INTEGER) - Total mention count, default 0
   - **related_entries** (UUID[]) - Array of related entry IDs, default '{}'
   - **corrected_names** (TEXT[]) - Array of corrected names, default '{}'
   - **relationship_counts** (JSONB) - Relationship statistics, default '{}'
   - **metadata** (JSONB) - Flexible metadata, default '{}'
   - **created_at** (TIMESTAMPTZ) - Creation timestamp
   - **updated_at** (TIMESTAMPTZ) - Last update timestamp
   - **UNIQUE** (user_id, name, type)

   **Indexes**:
   - people_places_user_id_idx (user_id)
   - people_places_type_idx (type)

### 32. Autopilot Alerts (autopilot_alerts)
   - **id** (PK, SERIAL) - Primary key
   - **user_id** (FK → auth.users.id) - Owner
   - **alert_type** (TEXT) - Alert type, NOT NULL
   - **risk_level** (INTEGER) - Risk level, NOT NULL
   - **evidence** (JSONB) - Evidence array, default '[]'
   - **resolved** (BOOLEAN) - Resolved flag, default false
   - **created_at** (TIMESTAMP) - Creation timestamp, default now()

   **Indexes**:
   - autopilot_alerts_user_idx (user_id)

### 33. Agent Logs (agent_logs)
   - **id** (PK, SERIAL) - Primary key
   - **agent_name** (TEXT) - Agent name, NOT NULL
   - **status** (TEXT) - Status, NOT NULL
   - **output** (JSONB) - Output data, NOT NULL, default '{}'
   - **created_at** (TIMESTAMP) - Creation timestamp, default now()

   **Indexes**:
   - agent_logs_agent_name_idx (agent_name)
   - agent_logs_created_at_idx (created_at DESC)

---

## RELATIONSHIPS

### User Relationships
- User 1--∞ Journal Entries
- User 1--∞ Chapters
- User 1--∞ Characters
- User 1--∞ Character Relationships
- User 1--∞ Character Memories
- User 1--∞ Timeline Mythos
- User 1--∞ Timeline Epochs
- User 1--∞ Timeline Eras
- User 1--∞ Timeline Sagas
- User 1--∞ Timeline Arcs
- User 1--∞ Timeline Scenes
- User 1--∞ Timeline Actions
- User 1--∞ Timeline MicroActions
- User 1--∞ Tasks
- User 1--∞ Task Events
- User 1--∞ Timeline Events
- User 1--∞ Task Memory Bridges
- User 1--∞ Fact Claims
- User 1--∞ Entry Verifications
- User 1--∞ Fact Verifications
- User 1--1 Subscription (UNIQUE)
- User 1--∞ Subscription Usage
- User 1--∞ Terms Acceptance
- User 1--1 Essence Profile (UNIQUE)
- User 1--∞ Daily Summaries
- User 1--1 Memoir Outline (UNIQUE)
- User 1--∞ Original Documents
- User 1--∞ People Places
- User 1--∞ Autopilot Alerts

### Timeline Hierarchy Relationships
- Timeline Mythos 1--∞ Timeline Epochs
- Timeline Epochs 1--∞ Timeline Eras
- Timeline Eras 1--∞ Timeline Sagas
- Timeline Sagas 1--∞ Timeline Arcs
- Timeline Arcs 1--∞ Chapters (via chapters.parent_id)
- Chapters 1--∞ Timeline Scenes
- Timeline Scenes 1--∞ Timeline Actions
- Timeline Actions 1--∞ Timeline MicroActions

### Journal Entry Relationships
- Journal Entry N--1 Chapter (via chapter_id)
- Journal Entry N--N Character (via character_memories)
- Journal Entry N--N Task (via task_memory_bridges)
- Journal Entry 1--N Fact Claims
- Journal Entry 1--N Entry Verifications

### Character Relationships
- Character N--N Character (via character_relationships, directional)
- Character N--N Journal Entry (via character_memories)
- Character 1--N Character Memories

### Task Relationships
- Task 1--N Task Events
- Task 1--N Timeline Events (optional)
- Task N--N Journal Entry (via task_memory_bridges)
- Task N--N Timeline Event (via task_memory_bridges)

### Verification Relationships
- Journal Entry 1--N Fact Claims
- Fact Claim 1--N Fact Verifications
- Journal Entry 1--N Entry Verifications

---

## IMPLEMENTATION NOTES

### Data Types
- **Primary Keys**: UUID with `gen_random_uuid()` default
- **Timestamps**: TIMESTAMPTZ (UTC timezone) for all date/time fields
- **Arrays**: TEXT[] for tags and other lists
- **Vectors**: VECTOR(1536) for semantic embeddings (pgvector extension)
- **Flexible Data**: JSONB for metadata and structured data
- **Enums**: Used for subscription_status and plan_type

### Tags Implementation
- Tags are stored as **TEXT[] arrays** directly on entities (journal_entries, characters, timeline layers)
- **NOT** stored in a separate Tag table with join tables
- GIN indexes used for efficient array queries

### Embeddings Implementation
- Embeddings stored as **VECTOR(1536) columns** directly on tables
- **NOT** stored in a separate Embedding table
- IVFFlat indexes used for similarity search
- pgvector extension required

### Media Storage
- Media files stored in **Supabase Storage** (not database tables)
- Photo metadata extracted and stored in journal entry metadata
- Character avatars stored as URLs (DiceBear or Supabase storage)

### Row Level Security (RLS)
- RLS enabled on sensitive tables
- Policies enforce user isolation: `auth.uid() = user_id`
- Standard policies: SELECT, INSERT, UPDATE (and DELETE where applicable)

### Indexes
- User-scoped queries: Indexes on `user_id` + other fields
- Date queries: Indexes on date fields (DESC for recent-first)
- Array queries: GIN indexes on TEXT[] arrays
- Vector queries: IVFFlat indexes on VECTOR columns
- Full-text search: GIN indexes on tsvector columns

### Helper Functions
- `match_journal_entries()`: Semantic search function for journal entries
- `update_updated_at_column()`: Trigger function for updated_at timestamps
- `initialize_free_subscription()`: Auto-create free subscription for new users
- `get_or_create_usage()`: Get or create monthly usage record
- `has_accepted_latest_terms()`: Check terms acceptance

### Constraints
- **Unique Constraints**: Prevent duplicates (user_id + name, user_id + date, etc.)
- **Check Constraints**: Validate enum values, score ranges
- **Foreign Keys**: Cascade deletes for data integrity
- **NOT NULL**: Required fields enforced at database level

### Migration References
- `000_setup_all_tables.sql`: Core tables
- `20250101_chapters_table.sql`: Chapters table
- `20250115_subscriptions.sql`: Subscription system
- `20250120_terms_acceptance.sql`: Terms tracking
- `20250120_timeline_hierarchy.sql`: 9-level timeline hierarchy
- `20250121_essence_profile.sql`: Essence profiles
- `20250210_embeddings.sql`: Vector embeddings
- `20250305_task_engine.sql`: Task system
- `20250313_character_knowledge_base.sql`: Character system
- `20250325_task_timeline_links.sql`: Task-memory bridges
- `202504_security_rls_hardening.sql`: RLS policies
- `20250515_autopilot_alerts.sql`: Autopilot alerts
- `20250601_agent_logs.sql`: Agent logs
- `20250602_memoir_outlines.sql`: Memoir outlines
- `20250603_original_documents.sql`: Original documents
- `20251118_character_avatars.sql`: Character avatars
- `20251118_verification_system.sql`: Verification system
- `20251118_verification_indexes.sql`: Verification indexes

---

## CORRECTIONS FROM ORIGINAL BLUEPRINT

1. **Memory → journal_entries**: Actual table name is `journal_entries` (no separate "memories" table exists)
2. **Tags**: Stored as TEXT[] arrays, not separate Tag table + join table
3. **Timeline Hierarchy**: 9 levels (Mythos→Epochs→Eras→Sagas→Arcs→Chapters→Scenes→Actions→MicroActions), not 3 (Era→Saga→Arc)
4. **Embeddings**: Stored as columns on tables, not separate Embedding table
5. **Media**: Stored in Supabase Storage, not Media table
6. **Character-Entry Links**: Via `character_memories` table (not MemoryCharacter join)
7. **Task-Entry Links**: Via `task_memory_bridges` table
8. **Missing Entities**: Added 20+ additional tables not in original blueprint
9. **Clusters**: Not implemented as separate table (clustering handled differently)
10. **Memory Links**: Not implemented as separate table (relationships via other mechanisms)
11. **MemoryBlock**: Conceptual processing format (not a database table) - used during ingestion
12. **Memory Fabric**: In-memory graph structure (not a database table) - used for semantic relationships

---

## FUTURE CONSIDERATIONS

### Data Model Enhancements

- **Conversation Sessions Table**: Group related chat messages into conversation sessions
  - `conversation_sessions` table with `session_id`, `started_at`, `ended_at`, `message_count`
  - Link entries via `metadata.conversation_id` or foreign key relationship
  - Enable viewing entire conversations as cohesive units

- **Memory Components Table**: Support multiple atomic memories within a single journal entry
  - `memory_components` table with `entry_id`, `component_index`, `content`, `memory_type`
  - Allow entries to contain multiple discrete memories while maintaining single entry structure
  - Enable better representation of composite memories ("Today I did X, Y, and Z")

- **Entry Relationships Table**: Explicit modeling of entry-to-entry relationships
  - `entry_relationships` table with `source_entry_id`, `target_entry_id`, `relationship_type`, `strength`
  - More structured than current semantic similarity or metadata links
  - Support conversation threads, related events, memory chains

- **Chat Message Storage**: Store full conversation history, not just persisted messages
  - `chat_messages` table for ephemeral conversation context
  - Link to journal entries when messages are persisted
  - Enable conversation reconstruction and context preservation

### Other Considerations

- Media table may be added if direct database storage is needed
- Cluster table may be added for semantic clustering
- Additional timeline layers could be added if needed
- Performance optimizations: partitioning, materialized views, etc.
- Entry versioning/history for edits and corrections

---

**END OF SPEC**


# Entity Relationship Diagrams (ERD)
## Lore Keeper Database Schema

**Version**: 1.0  
**Last Updated**: 2025-01-27  
**Purpose**: Comprehensive documentation of all entity relationships, with special focus on character relationships across all categories.

---

## Table of Contents

1. [Core Entities Overview](#core-entities-overview)
2. [Character Relationships](#character-relationships)
3. [Complete ERD Diagrams](#complete-erd-diagrams)
4. [Relationship Details](#relationship-details)
5. [Entity Definitions](#entity-definitions)

---

## Core Entities Overview

### Primary Entities

| Entity | Table Name | Description |
|--------|-----------|-------------|
| **Characters** | `characters` | People, beings, or entities referenced in journal lore |
| **Events** | `timeline_events`, `omega_entities` (type='EVENT') | Temporal events and occurrences |
| **Locations** | `locations` | Physical places and locations |
| **Perceptions** | `perception_entries` | User's subjective perceptions about others |
| **Timelines** | `timelines`, `timeline_*` hierarchy | Temporal organization structures |
| **Skills** | `skills` | User skills and achievements |
| **Groups** | `social_communities` | Social groups and communities |

---

## Location Relationships

### Location-Centric Relationship Diagram

```
                            ┌──────────────┐
                            │  LOCATIONS   │
                            │  (Central)   │
                            └──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│LOCATION      │          │LOCATION      │          │LOCATION      │
│MENTIONS      │          │(via          │          │(via          │
│              │          │resolved_     │          │journal       │
│              │          │events)        │          │entries)      │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│JOURNAL       │          │RESOLVED      │          │JOURNAL       │
│ENTRIES       │          │EVENTS        │          │ENTRIES       │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│CHARACTERS    │          │PERCEPTIONS   │          │TIMELINES     │
│(via          │          │(via          │          │(via          │
│character_    │          │related_      │          │timeline_     │
│memories)     │          │memory_id)    │          │memberships)  │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                        ┌───────────────────────┐
                        │  SKILLS & GROUPS     │
                        │  (via journal        │
                        │   entries)           │
                        └───────────────────────┘
```

---

## Event Relationships

### Event-Centric Relationship Diagram

```
                            ┌──────────────┐
                            │    EVENTS    │
                            │  (Central)   │
                            └──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│RESOLVED      │          │TIMELINE      │          │EVENT          │
│EVENTS        │          │EVENTS        │          │MENTIONS       │
│              │          │              │          │               │
│- people[]    │          │              │          │               │
│- locations[] │          │              │          │               │
│- activities[]│          │              │          │               │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│CHARACTERS   │          │JOURNAL       │          │JOURNAL       │
│(via people  │          │ENTRIES       │          │ENTRIES       │
│ array)       │          │(via          │          │(via          │
│              │          │task_memory_  │          │event_mentions)│
│              │          │bridges)     │          │               │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│LOCATIONS     │          │PERCEPTIONS   │          │TIMELINES     │
│(via          │          │(via          │          │(via          │
│locations[]   │          │related_      │          │timeline_     │
│array)        │          │memory_id)    │          │memberships)  │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                        ┌───────────────────────┐
                        │  SKILLS & GROUPS     │
                        │  (via journal        │
                        │   entries)           │
                        └───────────────────────┘
```

---

## Character Relationships

### Character ↔ Character Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │  Character  │
│  (Source)   │───[relationship]──▶│  (Target)  │
└─────────────┘                    └─────────────┘
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ character_relationships│
         │ - relationship_type    │
         │ - closeness_score      │
         │ - last_shared_memory_id│
         └───────────────────────┘
```

**Table**: `character_relationships`
- **Type**: Many-to-Many (directional)
- **Relationship Types**: ally, sibling, rival, friend, colleague, family, etc.
- **Closeness Score**: -10 to 10 (hostility to support)
- **Last Shared Memory**: Links to most recent journal entry involving both characters

**Additional Character Fields**:
- `associated_with_character_ids` (UUID[]) - Array of character IDs this person is associated with
- `mentioned_by_character_ids` (UUID[]) - Array of character IDs who mentioned this person

These array fields provide quick lookups for character associations without requiring joins.

---

### Character ↔ Journal Entry Relationships

```
┌─────────────┐                    ┌──────────────┐
│  Character  │                    │ Journal Entry│
│             │                    │              │
└─────────────┘                    └──────────────┘
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ character_memories    │
         │ - role                │
         │ - emotion             │
         │ - perspective         │
         │ - chapter_id          │
         └───────────────────────┘
```

**Table**: `character_memories`
- **Type**: Many-to-Many
- **Purpose**: Links characters to journal entries where they appear
- **Role**: Character's role in the memory (participant, observer, mentioned, etc.)
- **Perspective**: Narrative viewpoint (narrator, observer, participant, antagonist)

---

### Character ↔ Location Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │  Location   │
│             │                    │             │
└─────────────┘                    └─────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  journal_entries       │
         │  (via character_       │
         │   memories +          │
         │   location_mentions)   │
         └───────────────────────┘
```

**Indirect Relationship**: Characters are linked to locations through:
1. `character_memories` → links character to journal entry
2. `location_mentions` → links location to journal entry
3. Both reference the same `journal_entry_id`

**Query Pattern**:
```sql
SELECT DISTINCT l.*
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN character_memories cm ON lm.memory_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

---

### Character ↔ Perception Relationships

```
┌─────────────┐                    ┌──────────────────┐
│  Character  │                    │ Perception Entry │
│             │                    │                  │
└─────────────┘                    └──────────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ perception_entries     │
         │ - subject_person_id    │
         │ - source_character_id   │
         │ - related_memory_id     │
         └───────────────────────┘
```

**Table**: `perception_entries`
- **Subject Relationship**: `subject_person_id` → `characters.id`
  - The person the perception is about
- **Source Relationship**: `source_character_id` → `characters.id`
  - Who told you (if source = 'told_by')
- **Memory Link**: `related_memory_id` → `journal_entries.id`
  - Related journal entry context

**Key Fields**:
- `subject_person_id`: Character this perception is about
- `source_character_id`: Character who told you (if applicable)
- `related_memory_id`: Related journal entry

---

### Character ↔ Event Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │   Event    │
│             │                    │             │
└─────────────┘                    └─────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  journal_entries      │
         │  (via character_      │
         │   memories +          │
         │   timeline_events)    │
         └───────────────────────┘
```

**Indirect Relationship**: Characters link to events through:
1. `character_memories` → links character to journal entry
2. `timeline_events` → links event to journal entry (via `task_memory_bridges` or direct reference)
3. `omega_entities` (type='EVENT') → can reference characters in metadata

**Alternative Path**: `omega_entities` with type='EVENT' can have character relationships in metadata

---

### Character ↔ Timeline Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │  Timeline   │
│             │                    │             │
└─────────────┘                    └─────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  timeline_memberships │
         │  (via journal_entries │
         │   + character_memories)│
         └───────────────────────┘
```

**Indirect Relationship**: Characters link to timelines through:
1. `character_memories` → links character to journal entry
2. `timeline_memberships` → links journal entry to timeline

**Query Pattern**:
```sql
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN character_memories cm ON tm.journal_entry_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

---

### Character ↔ Skill Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │   Skill    │
│             │                    │             │
└─────────────┘                    └─────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  journal_entries      │
         │  (via character_       │
         │   memories +          │
         │   skill_progress)     │
         └───────────────────────┘
```

**Indirect Relationship**: Characters link to skills through:
1. `character_memories` → links character to journal entry
2. `skill_progress` → links skill to journal entry (via `source_id`)

**Note**: Skills are primarily user-scoped, but can be associated with characters through journal entries where both appear.

---

### Character ↔ Group Relationships

```
┌─────────────┐                    ┌─────────────┐
│  Character  │                    │   Group    │
│             │                    │(Community)  │
└─────────────┘                    └─────────────┘
     │                                    │
     │                                    │
     │                                    │
     └──────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  social_communities   │
         │  - members (TEXT[])   │
         │  - theme              │
         └───────────────────────┘
```

**Table**: `social_communities`
- **Type**: Many-to-Many (via array)
- **Members Field**: `members TEXT[]` - Array of character names
- **Relationship**: Characters are members of communities through the `members` array field

**Query Pattern**:
```sql
SELECT sc.*
FROM social_communities sc
WHERE ? = ANY(sc.members)
```

**Alternative**: Characters can also be linked through `social_nodes` and `social_edges` tables.

---

## Complete ERD Diagrams

### Full Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER (auth.users)                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌──────────────────┐  ┌──────────┐  ┌──────────────┐
        │  JOURNAL ENTRIES  │  │CHAPTERS  │  │  CHARACTERS  │
        └──────────────────┘  └──────────┘  └──────────────┘
                    │               │               │
                    │               │               │
        ┌───────────┼───────────────┼───────────────┼───────────┐
        │           │               │               │           │
        ▼           ▼               ▼               ▼           ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
│LOCATION     │ │PERCEPTION│ │  EVENT   │ │CHARACTER     │ │  SKILL   │
│MENTIONS     │ │ ENTRIES  │ │          │ │RELATIONSHIPS │ │          │
└─────────────┘ └──────────┘ └──────────┘ └──────────────┘ └──────────┘
        │           │               │               │           │
        │           │               │               │           │
        ▼           ▼               ▼               ▼           ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
│  LOCATIONS  │ │CHARACTERS│ │TIMELINE   │ │CHARACTERS    │ │SKILL     │
│             │ │(subject) │ │EVENTS     │ │(source/target)│ │PROGRESS  │
└─────────────┘ └──────────┘ └──────────┘ └──────────────┘ └──────────┘
        │           │               │               │           │
        │           │               │               │           │
        └───────────┴───────────────┴───────────────┴───────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   TIMELINE MEMBERSHIPS│
                        └───────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │      TIMELINES        │
                        └───────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │  SOCIAL COMMUNITIES   │
                        │    (GROUPS)           │
                        └───────────────────────┘
```

---

### Character-Centric Relationship Diagram

```
                            ┌──────────────┐
                            │  CHARACTERS  │
                            │  (Central)   │
                            └──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│CHARACTER     │          │CHARACTER     │          │CHARACTER     │
│RELATIONSHIPS│          │MEMORIES      │          │(via          │
│              │          │              │          │perceptions)  │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│CHARACTERS   │          │JOURNAL       │          │PERCEPTION    │
│(target)     │          │ENTRIES       │          │ENTRIES       │
└──────────────┘          └──────────────┘          └──────────────┘
                                   │                          │
                                   │                          │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│LOCATIONS     │          │TIMELINES    │          │EVENTS        │
│(via mentions)│          │(via         │          │(via          │
│              │          │memberships) │          │timeline_     │
│              │          │              │          │events)       │
└──────────────┘          └──────────────┘          └──────────────┘
                                   │
                                   │
                                   ▼
                        ┌───────────────────────┐
                        │  SOCIAL COMMUNITIES  │
                        │  (GROUPS)            │
                        │  - members[]         │
                        └───────────────────────┘
```

---

## Relationship Details

### 1. Character ↔ Character

**Table**: `character_relationships`

| Field | Type | Description |
|-------|------|-------------|
| `source_character_id` | UUID → characters.id | Source character |
| `target_character_id` | UUID → characters.id | Target character |
| `relationship_type` | TEXT | Type of relationship |
| `closeness_score` | SMALLINT | -10 to 10 (hostility to support) |
| `last_shared_memory_id` | UUID → journal_entries.id | Most recent shared memory |

**Cardinality**: N:N (directional)

**Example Relationships**:
- Friend, Family, Colleague, Rival, Mentor, Student, etc.

---

### 2. Character ↔ Journal Entry

**Table**: `character_memories`

| Field | Type | Description |
|-------|------|-------------|
| `character_id` | UUID → characters.id | Character reference |
| `journal_entry_id` | UUID → journal_entries.id | Journal entry reference |
| `role` | TEXT | Character's role in memory |
| `emotion` | TEXT | Emotional state |
| `perspective` | TEXT | Narrative perspective |
| `chapter_id` | UUID → chapters.id | Optional chapter reference |

**Cardinality**: N:N

**Purpose**: Links characters to specific journal entries where they appear, enabling rich queries across lore.

---

### 3. Character ↔ Location

**Indirect Relationship** via:
- `character_memories` → `journal_entries`
- `location_mentions` → `journal_entries`

**Query Example**:
```sql
-- Find all locations associated with a character
SELECT DISTINCT l.*
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN character_memories cm ON lm.memory_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

**Cardinality**: N:N (indirect)

---

### 4. Character ↔ Perception

**Table**: `perception_entries`

| Field | Type | Description |
|-------|------|-------------|
| `subject_person_id` | UUID → characters.id | Person perception is about |
| `source_character_id` | UUID → characters.id | Who told you (if source='told_by') |
| `related_memory_id` | UUID → journal_entries.id | Related journal entry |

**Cardinality**: 
- Character → Perception: 1:N (as subject)
- Character → Perception: 1:N (as source)

**Purpose**: Tracks user's subjective perceptions about characters, not objective truth.

---

### 5. Character ↔ Event

**Indirect Relationship** via:
- `character_memories` → `journal_entries`
- `timeline_events` → `journal_entries` (via `task_memory_bridges`)

**Alternative**: `omega_entities` (type='EVENT') can reference characters in metadata.

**Cardinality**: N:N (indirect)

---

### 6. Character ↔ Timeline

**Indirect Relationship** via:
- `character_memories` → `journal_entries`
- `timeline_memberships` → `journal_entries` → `timelines`

**Query Example**:
```sql
-- Find all timelines involving a character
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN character_memories cm ON tm.journal_entry_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

**Cardinality**: N:N (indirect)

---

### 7. Character ↔ Skill

**Indirect Relationship** via:
- `character_memories` → `journal_entries`
- `skill_progress` → `journal_entries` (via `source_id`)

**Note**: Skills are primarily user-scoped, but can be associated with characters through shared journal entries.

**Cardinality**: N:N (indirect)

---

### 8. Character ↔ Group (Community)

**Table**: `social_communities`

| Field | Type | Description |
|-------|------|-------------|
| `members` | TEXT[] | Array of character names |
| `theme` | TEXT | Community theme |
| `cohesion` | FLOAT | Community cohesion score |

**Cardinality**: N:N (via array membership)

**Query Example**:
```sql
-- Find all communities a character belongs to
SELECT sc.*
FROM social_communities sc
WHERE ? = ANY(sc.members)
```

**Alternative**: Characters can also be linked through `social_nodes` and `social_edges` tables.

---

## Entity Definitions

### Characters

**Table**: `characters`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `name` (TEXT, NOT NULL) - Character name
- `alias` (TEXT[]) - Alternate names/titles
- `pronouns` (TEXT) - Pronoun preference
- `archetype` (TEXT) - Story archetype
- `first_appearance` (DATE) - First appearance date
- `embedding` (VECTOR(1536)) - Semantic embedding
- `associated_with_character_ids` (UUID[]) - Array of associated character IDs
- `mentioned_by_character_ids` (UUID[]) - Array of character IDs who mentioned this person
- `perception_count` (INTEGER) - Number of perception entries about this person

**Relationships**:
- N:N with Characters (via `character_relationships`)
- N:N with Journal Entries (via `character_memories`)
- 1:N with Perceptions (as subject or source)
- N:N with Locations (indirect via journal entries)
- N:N with Events (indirect via journal entries)
- N:N with Timelines (indirect via journal entries)
- N:N with Skills (indirect via journal entries)
- N:N with Groups (via `social_communities.members` array)

---

### Events

**Tables**: `timeline_events`, `resolved_events`, `omega_entities` (type='EVENT'), `event_mentions`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `title` (TEXT) - Event title
- `occurred_at` / `start_time` (TIMESTAMPTZ) - When event occurred
- `end_time` (TIMESTAMPTZ) - When event ended (resolved_events)
- `description` / `summary` (TEXT) - Event description
- `type` (TEXT) - Event type
- `people` (UUID[]) - Array of character IDs (resolved_events)
- `locations` (UUID[]) - Array of location IDs (resolved_events)
- `activities` (UUID[]) - Array of activity IDs (resolved_events)
- `confidence` (FLOAT) - Event confidence score
- `embedding` (VECTOR(1536)) - Semantic embedding

**Relationships**:
- **N:N with Journal Entries** (direct via `event_mentions` and `task_memory_bridges`)
- **N:N with Characters** (direct via `resolved_events.people` array, indirect via journal entries)
- **N:N with Locations** (direct via `resolved_events.locations` array, indirect via journal entries)
- **N:N with Perceptions** (indirect via journal entries - perception_entries.related_memory_id)
- **N:N with Timelines** (via `timeline_memberships` and `task_memory_bridges`)
- **N:N with Skills** (indirect via journal entries + skill_progress.source_id)
- **N:N with Groups** (indirect via characters + social_communities.members)

---

### Locations

**Table**: `locations`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `name` (TEXT, NOT NULL) - Location name
- `normalized_name` (TEXT, NOT NULL) - Normalized name for matching
- `type` (TEXT) - Location type
- `latitude` (DOUBLE PRECISION) - GPS latitude
- `longitude` (DOUBLE PRECISION) - GPS longitude
- `embedding` (VECTOR(1536)) - Semantic embedding

**Relationships**:
- **N:N with Journal Entries** (via `location_mentions` and `photo_location_links`) - Direct relationships
- **N:N with Characters** (indirect via journal entries + character_memories)
- **N:N with Events** (direct via `resolved_events.locations` array, indirect via journal entries)
- **N:N with Perceptions** (indirect via journal entries - perception_entries.related_memory_id)
- **N:N with Timelines** (indirect via journal entries + timeline_memberships)
- **N:N with Skills** (indirect via journal entries + skill_progress.source_id, also via `photo_location_links` + `photo_skill_links`)
- **N:N with Groups** (indirect via characters + social_communities.members)

---

### Perceptions

**Table**: `perception_entries`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `subject_person_id` (UUID → characters.id) - Person perception is about
- `source_character_id` (UUID → characters.id) - Who told you
- `content` (TEXT, NOT NULL) - Perception content
- `confidence_level` (TEXT) - Confidence level
- `related_memory_id` (UUID → journal_entries.id) - Related journal entry

**Relationships**:
- N:1 with Characters (as subject)
- N:1 with Characters (as source)
- N:1 with Journal Entries (via `related_memory_id`)
- N:1 with Timelines (via `related_timeline_id`)
- **N:N with Locations** (indirect via journal entries - location_mentions → journal_entries → perception_entries.related_memory_id)

---

### Timelines

**Tables**: `timelines`, `timeline_mythos`, `timeline_epochs`, `timeline_eras`, `timeline_sagas`, `timeline_arcs`, `timeline_scenes`, `timeline_actions`, `timeline_microactions`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `title` (TEXT, NOT NULL) - Timeline title
- `timeline_type` (TEXT) - Type: life_era, sub_timeline, skill, location, work, custom
- `start_date` (TIMESTAMPTZ) - Start date
- `end_date` (TIMESTAMPTZ) - End date
- `parent_id` (UUID → timelines.id) - Parent timeline

**Relationships**:
- N:N with Journal Entries (via `timeline_memberships`)
- N:N with Characters (indirect via journal entries)
- N:1 with Timelines (parent-child hierarchy)
- **N:N with Locations** (indirect via journal entries - location_mentions → journal_entries → timeline_memberships)

---

### Skills

**Table**: `skills`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `skill_name` (TEXT, NOT NULL) - Skill name
- `skill_category` (TEXT) - Category: professional, creative, physical, etc.
- `current_level` (INTEGER) - Current skill level
- `total_xp` (INTEGER) - Total experience points
- `first_mentioned_at` (TIMESTAMPTZ) - First mention date

**Relationships**:
- 1:N with Skill Progress (via `skill_progress`)
- N:N with Journal Entries (via `skill_progress.source_id`)
- N:N with Characters (indirect via journal entries)
- **N:N with Locations** (indirect via journal entries - location_mentions → journal_entries → skill_progress.source_id)

---

### Groups (Communities)

**Table**: `social_communities`

**Primary Key**: `id` (UUID)

**Key Fields**:
- `community_id` (TEXT, NOT NULL) - Community identifier
- `members` (TEXT[]) - Array of character names
- `theme` (TEXT) - Community theme
- `cohesion` (FLOAT) - Community cohesion score

**Relationships**:
- N:N with Characters (via `members` array)
- **N:N with Locations** (indirect via characters - social_communities.members → characters → character_memories → journal_entries → location_mentions)

---

## Location Relationship Details

### 1. Location ↔ Journal Entry

**Tables**: `location_mentions`, `photo_location_links`

| Field | Type | Description |
|-------|------|-------------|
| `location_id` | UUID → locations.id | Location reference |
| `memory_id` / `journal_entry_id` | UUID → journal_entries.id | Journal entry reference |
| `raw_text` | TEXT | Original text where location was mentioned (location_mentions) |
| `extracted_name` | TEXT | Extracted location name (location_mentions) |
| `confidence` | FLOAT | Detection confidence (photo_location_links) |
| `auto_detected` | BOOLEAN | Whether auto-detected (photo_location_links) |

**Cardinality**: N:N (direct)

**Purpose**: Direct links between locations and journal entries:
- `location_mentions`: Text-based location mentions in journal entries
- `photo_location_links`: Photo-based location detection in journal entries

---

### 2. Location ↔ Character

**Indirect Relationship** via:
- `location_mentions` → `journal_entries`
- `character_memories` → `journal_entries`

**Query Example**:
```sql
-- Find all characters associated with a location
SELECT DISTINCT c.*
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (indirect)

---

### 3. Location ↔ Event

**Direct Relationship**: `resolved_events.locations` (UUID[] array)

**Indirect Relationship**: Via journal entries

**Query Examples**:
```sql
-- Direct: Find events at a location (via resolved_events)
SELECT re.*
FROM resolved_events re
WHERE ? = ANY(re.locations)

-- Indirect: Find events via journal entries
SELECT DISTINCT te.*
FROM timeline_events te
JOIN task_memory_bridges tmb ON te.id = tmb.timeline_event_id
JOIN location_mentions lm ON tmb.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (direct and indirect)

---

### 4. Location ↔ Perception

**Indirect Relationship** via:
- `location_mentions` → `journal_entries`
- `perception_entries.related_memory_id` → `journal_entries`

**Query Example**:
```sql
-- Find all perceptions related to a location
SELECT DISTINCT pe.*
FROM perception_entries pe
JOIN location_mentions lm ON pe.related_memory_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (indirect)

---

### 5. Location ↔ Timeline

**Indirect Relationship** via:
- `location_mentions` → `journal_entries`
- `timeline_memberships` → `journal_entries` → `timelines`

**Query Example**:
```sql
-- Find all timelines involving a location
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN location_mentions lm ON tm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (indirect)

---

### 6. Location ↔ Skill

**Direct Relationship**: Via `photo_location_links` + `photo_skill_links` (both reference same journal_entry_id)

**Indirect Relationship** via:
- `location_mentions` → `journal_entries`
- `skill_progress.source_id` → `journal_entries`

**Query Examples**:
```sql
-- Direct: Find skills via photo links
SELECT DISTINCT s.*
FROM skills s
JOIN photo_skill_links psl ON s.id = psl.skill_id
JOIN photo_location_links pll ON psl.journal_entry_id = pll.journal_entry_id
WHERE pll.location_id = ?

-- Indirect: Find skills via location mentions
SELECT DISTINCT s.*
FROM skills s
JOIN skill_progress sp ON s.id = sp.skill_id
JOIN location_mentions lm ON sp.source_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (direct and indirect)

---

### 7. Location ↔ Group (Community)

**Indirect Relationship** via:
- `social_communities.members` → `characters`
- `character_memories` → `journal_entries`
- `location_mentions` → `journal_entries`

**Query Example**:
```sql
-- Find all groups associated with a location
SELECT DISTINCT sc.*
FROM social_communities sc
JOIN characters c ON c.name = ANY(sc.members)
JOIN character_memories cm ON c.id = cm.character_id
JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

**Cardinality**: N:N (indirect)

---

## Event Relationship Details

### 1. Event ↔ Journal Entry

**Tables**: `event_mentions`, `task_memory_bridges`

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | UUID → resolved_events.id | Event reference (event_mentions) |
| `timeline_event_id` | UUID → timeline_events.id | Timeline event reference (task_memory_bridges) |
| `memory_id` / `journal_entry_id` | UUID → journal_entries.id | Journal entry reference |
| `signal` | JSONB | Signal data (event_mentions) |
| `bridge_type` | TEXT | Bridge type (task_memory_bridges) |

**Cardinality**: N:N (direct)

**Purpose**: Direct links between events and journal entries:
- `event_mentions`: Links resolved_events to journal entries that contributed to the event
- `task_memory_bridges`: Links timeline_events to journal entries via tasks

---

### 2. Event ↔ Character

**Direct Relationship**: `resolved_events.people` (UUID[] array)

**Indirect Relationship**: Via journal entries

**Query Examples**:
```sql
-- Direct: Find characters in an event (via resolved_events)
SELECT c.*
FROM characters c
JOIN resolved_events re ON c.id = ANY(re.people)
WHERE re.id = ?

-- Indirect: Find characters via journal entries
SELECT DISTINCT c.*
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN event_mentions em ON cm.journal_entry_id = em.memory_id
WHERE em.event_id = ?
```

**Cardinality**: N:N (direct and indirect)

---

### 3. Event ↔ Location

**Direct Relationship**: `resolved_events.locations` (UUID[] array)

**Indirect Relationship**: Via journal entries

**Query Examples**:
```sql
-- Direct: Find locations for an event (via resolved_events)
SELECT l.*
FROM locations l
JOIN resolved_events re ON l.id = ANY(re.locations)
WHERE re.id = ?

-- Indirect: Find locations via journal entries
SELECT DISTINCT l.*
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN event_mentions em ON lm.memory_id = em.memory_id
WHERE em.event_id = ?
```

**Cardinality**: N:N (direct and indirect)

---

### 4. Event ↔ Perception

**Indirect Relationship** via:
- `event_mentions` → `journal_entries`
- `perception_entries.related_memory_id` → `journal_entries`

**Query Example**:
```sql
-- Find all perceptions related to an event
SELECT DISTINCT pe.*
FROM perception_entries pe
JOIN event_mentions em ON pe.related_memory_id = em.memory_id
WHERE em.event_id = ?
```

**Cardinality**: N:N (indirect)

---

### 5. Event ↔ Timeline

**Direct Relationship**: Via `task_memory_bridges` → `timeline_memberships`

**Indirect Relationship**: Via journal entries

**Query Examples**:
```sql
-- Direct: Find timelines via task_memory_bridges
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN task_memory_bridges tmb ON tm.journal_entry_id = tmb.journal_entry_id
WHERE tmb.timeline_event_id = ?

-- Indirect: Find timelines via event_mentions
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN event_mentions em ON tm.journal_entry_id = em.memory_id
WHERE em.event_id = ?
```

**Cardinality**: N:N (direct and indirect)

---

### 6. Event ↔ Skill

**Indirect Relationship** via:
- `event_mentions` → `journal_entries`
- `skill_progress.source_id` → `journal_entries`

**Query Example**:
```sql
-- Find all skills associated with an event
SELECT DISTINCT s.*
FROM skills s
JOIN skill_progress sp ON s.id = sp.skill_id
JOIN event_mentions em ON sp.source_id = em.memory_id
WHERE em.event_id = ?
```

**Cardinality**: N:N (indirect)

---

### 7. Event ↔ Group (Community)

**Indirect Relationship** via:
- `resolved_events.people` → `characters`
- `social_communities.members` → `characters`

**Query Example**:
```sql
-- Find all groups associated with an event
SELECT DISTINCT sc.*
FROM social_communities sc
JOIN characters c ON c.name = ANY(sc.members)
JOIN resolved_events re ON c.id = ANY(re.people)
WHERE re.id = ?
```

**Cardinality**: N:N (indirect)

---

### 8. Event ↔ Event (Continuity)

**Table**: `event_continuity_links`

| Field | Type | Description |
|-------|------|-------------|
| `current_event_id` | UUID → resolved_events.id | Current event |
| `past_event_id` | UUID → resolved_events.id | Past event |
| `continuity_type` | TEXT | Type of continuity link |

**Cardinality**: N:N (directional)

**Purpose**: Links events to show continuity, causality, or temporal relationships between events.

---

## Summary of Event Relationships

### Direct Relationships

1. **Event → Journal Entry**: Via `event_mentions` and `task_memory_bridges` (many-to-many)
2. **Event → Character**: Via `resolved_events.people` array (many-to-many)
3. **Event → Location**: Via `resolved_events.locations` array (many-to-many)
4. **Event → Event**: Via `event_continuity_links` (many-to-many, directional)

### Indirect Relationships

5. **Event → Perception**: Via `event_mentions` + `perception_entries.related_memory_id` (many-to-many)
6. **Event → Timeline**: Via `task_memory_bridges` + `timeline_memberships` (many-to-many)
7. **Event → Skill**: Via `event_mentions` + `skill_progress.source_id` (many-to-many)
8. **Event → Group**: Via `resolved_events.people` + `social_communities.members` (many-to-many)

### Relationship Strength

- **Strong**: Event-Journal Entry (direct), Event-Character (direct via people array), Event-Location (direct via locations array), Event-Event (direct via continuity links)
- **Moderate**: Event-Timeline
- **Weak**: Event-Perception, Event-Skill, Event-Group

---

## Summary of Location Relationships

### Direct Relationships

1. **Location → Journal Entry**: Via `location_mentions` and `photo_location_links` (many-to-many)
2. **Location → Event**: Via `resolved_events.locations` array (many-to-many)
3. **Location → Skill**: Via `photo_location_links` + `photo_skill_links` (many-to-many)

### Indirect Relationships

3. **Location → Character**: Via `location_mentions` + `character_memories` (many-to-many)
4. **Location → Perception**: Via `location_mentions` + `perception_entries.related_memory_id` (many-to-many)
5. **Location → Timeline**: Via `location_mentions` + `timeline_memberships` (many-to-many)
6. **Location → Skill**: Via `location_mentions` + `skill_progress.source_id` (many-to-many)
7. **Location → Group**: Via `location_mentions` + `character_memories` + `social_communities.members` (many-to-many)

### Relationship Strength

- **Strong**: Location-Journal Entry (direct via location_mentions and photo_location_links), Location-Event (direct via resolved_events.locations), Location-Skill (direct via photo links)
- **Moderate**: Location-Character, Location-Timeline
- **Weak**: Location-Perception, Location-Group

---

## Summary of Character Relationships

### Direct Relationships

1. **Character → Character**: Via `character_relationships` (directional, many-to-many)
2. **Character → Journal Entry**: Via `character_memories` (many-to-many)
3. **Character → Perception**: Via `perception_entries.subject_person_id` and `source_character_id` (one-to-many)

### Indirect Relationships

4. **Character → Location**: Via `character_memories` + `location_mentions` (many-to-many)
5. **Character → Event**: Via `character_memories` + `timeline_events` (many-to-many)
6. **Character → Timeline**: Via `character_memories` + `timeline_memberships` (many-to-many)
7. **Character → Skill**: Via `character_memories` + `skill_progress` (many-to-many)
8. **Character → Group**: Via `social_communities.members` array (many-to-many)

### Relationship Strength

- **Strong**: Character-Character, Character-Journal Entry, Character-Perception
- **Moderate**: Character-Location, Character-Event, Character-Timeline
- **Weak**: Character-Skill, Character-Group

---

## Query Patterns

### Find All Characters in a Location

```sql
SELECT DISTINCT c.*
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Events Involving a Character

```sql
SELECT DISTINCT te.*
FROM timeline_events te
JOIN task_memory_bridges tmb ON te.id = tmb.timeline_event_id
JOIN character_memories cm ON tmb.journal_entry_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

### Find All Timelines for a Character

```sql
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN character_memories cm ON tm.journal_entry_id = cm.journal_entry_id
WHERE cm.character_id = ?
```

### Find All Groups a Character Belongs To

```sql
SELECT sc.*
FROM social_communities sc
WHERE ? = ANY(sc.members)
```

### Find Character Relationship Network

```sql
-- Get all relationships for a character
SELECT 
  c1.name as source_name,
  c2.name as target_name,
  cr.relationship_type,
  cr.closeness_score
FROM character_relationships cr
JOIN characters c1 ON cr.source_character_id = c1.id
JOIN characters c2 ON cr.target_character_id = c2.id
WHERE cr.source_character_id = ? OR cr.target_character_id = ?
```

### Find All Locations for an Event

```sql
-- Direct relationship via resolved_events
SELECT l.*
FROM locations l
JOIN resolved_events re ON l.id = ANY(re.locations)
WHERE re.id = ?

-- Or via journal entries
SELECT DISTINCT l.*
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN task_memory_bridges tmb ON lm.memory_id = tmb.journal_entry_id
WHERE tmb.timeline_event_id = ?
```

### Find All Events at a Location

```sql
-- Direct relationship
SELECT re.*
FROM resolved_events re
WHERE ? = ANY(re.locations)

-- Indirect via journal entries
SELECT DISTINCT te.*
FROM timeline_events te
JOIN task_memory_bridges tmb ON te.id = tmb.timeline_event_id
JOIN location_mentions lm ON tmb.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Perceptions Related to a Location

```sql
SELECT DISTINCT pe.*
FROM perception_entries pe
JOIN location_mentions lm ON pe.related_memory_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Timelines for a Location

```sql
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN location_mentions lm ON tm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Skills Practiced at a Location

```sql
SELECT DISTINCT s.*
FROM skills s
JOIN skill_progress sp ON s.id = sp.skill_id
JOIN location_mentions lm ON sp.source_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Groups Associated with a Location

```sql
SELECT DISTINCT sc.*
FROM social_communities sc
JOIN characters c ON c.name = ANY(sc.members)
JOIN character_memories cm ON c.id = cm.character_id
JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
WHERE lm.location_id = ?
```

### Find All Characters in an Event

```sql
-- Direct relationship via resolved_events
SELECT c.*
FROM characters c
JOIN resolved_events re ON c.id = ANY(re.people)
WHERE re.id = ?

-- Indirect via journal entries
SELECT DISTINCT c.*
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN event_mentions em ON cm.journal_entry_id = em.memory_id
WHERE em.event_id = ?
```

### Find All Locations for an Event

```sql
-- Direct relationship via resolved_events
SELECT l.*
FROM locations l
JOIN resolved_events re ON l.id = ANY(re.locations)
WHERE re.id = ?

-- Indirect via journal entries
SELECT DISTINCT l.*
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN event_mentions em ON lm.memory_id = em.memory_id
WHERE em.event_id = ?
```

### Find All Perceptions Related to an Event

```sql
SELECT DISTINCT pe.*
FROM perception_entries pe
JOIN event_mentions em ON pe.related_memory_id = em.memory_id
WHERE em.event_id = ?
```

### Find All Timelines for an Event

```sql
-- Via task_memory_bridges
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN task_memory_bridges tmb ON tm.journal_entry_id = tmb.journal_entry_id
WHERE tmb.timeline_event_id = ?

-- Via event_mentions
SELECT DISTINCT t.*
FROM timelines t
JOIN timeline_memberships tm ON t.id = tm.timeline_id
JOIN event_mentions em ON tm.journal_entry_id = em.memory_id
WHERE em.event_id = ?
```

### Find All Skills Associated with an Event

```sql
SELECT DISTINCT s.*
FROM skills s
JOIN skill_progress sp ON s.id = sp.skill_id
JOIN event_mentions em ON sp.source_id = em.memory_id
WHERE em.event_id = ?
```

### Find All Groups Associated with an Event

```sql
SELECT DISTINCT sc.*
FROM social_communities sc
JOIN characters c ON c.name = ANY(sc.members)
JOIN resolved_events re ON c.id = ANY(re.people)
WHERE re.id = ?
```

### Find Related Events (Continuity Links)

```sql
-- Find events that led to this event
SELECT re.*
FROM resolved_events re
JOIN event_continuity_links ecl ON re.id = ecl.past_event_id
WHERE ecl.current_event_id = ?

-- Find events that resulted from this event
SELECT re.*
FROM resolved_events re
JOIN event_continuity_links ecl ON re.id = ecl.current_event_id
WHERE ecl.past_event_id = ?
```

---

## Notes

1. **Character-Centric Design**: Characters are central entities with rich relationships across all categories
2. **Location-Centric Design**: Locations are also central entities, connected to all other entities through direct and indirect relationships
3. **Indirect Relationships**: Many relationships are indirect via journal entries, enabling flexible querying
4. **Array-Based Relationships**: Groups and resolved_events use array fields (members, locations) for many-to-many relationships
5. **Directional Relationships**: Character relationships are directional (source → target)
6. **Temporal Tracking**: Most relationships include temporal information (created_at, updated_at, timestamps)
7. **Location Connections**: Locations connect to:
   - **Direct**: Journal Entries (via location_mentions and photo_location_links), Events (via resolved_events.locations array)
   - **Indirect**: Characters, Perceptions, Timelines, Skills, Groups (all via journal entries)
8. **Event Connections**: Events connect to:
   - **Direct**: Journal Entries (via event_mentions and task_memory_bridges), Characters (via resolved_events.people array), Locations (via resolved_events.locations array), Events (via event_continuity_links)
   - **Indirect**: Perceptions, Timelines, Skills, Groups (all via journal entries)

---

**END OF ERD DOCUMENTATION**

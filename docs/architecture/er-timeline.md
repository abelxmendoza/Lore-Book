# ER Diagram: Timeline Domain

> Generated from `information_schema` on the live local Supabase DB (283 tables).

This diagram covers the **autobiographical time structure** — how entries, events,
and narrative moments are placed on a 7-level temporal hierarchy.

```mermaid
erDiagram
    %% ── Temporal hierarchy (Mythos → Epoch → Era → Saga → Arc → Chapter → Scene → Action → Micro) ──
    timeline_mythos {
        uuid id PK
        uuid user_id
        text title
        text description
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_epochs {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_mythos"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_eras {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_epochs"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_sagas {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_eras"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_arcs {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_sagas"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    chapters {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_arcs"
        text title
        text summary
        timestamptz start_date
        timestamptz end_date
    }

    timeline_scenes {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ chapters"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_actions {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_scenes"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_microactions {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timeline_actions"
        text title
        text source_type
        timestamptz start_date
        timestamptz end_date
    }

    %% ── Flat timelines (user-named collections) ────────────────────────────
    timelines {
        uuid id PK
        uuid user_id
        uuid parent_id FK      "→ timelines (self-ref for sub-timelines)"
        text title
        text description
        text timeline_type
        timestamptz start_date
        timestamptz end_date
    }

    timeline_relationships {
        uuid id PK
        uuid user_id
        uuid source_timeline_id FK
        uuid target_timeline_id FK
        text relationship_type
        text description
    }

    timeline_memberships {
        uuid id PK
        uuid user_id
        uuid journal_entry_id FK
        uuid timeline_id FK
        text role
        numeric importance_score
    }

    %% ── Cross-layer bridge ─────────────────────────────────────────────────
    timeline_links {
        uuid id PK
        uuid component_id FK   "→ memory_components"
        uuid mythos_id FK
        uuid epoch_id FK
        uuid era_id FK
        uuid saga_id FK
        uuid arc_id FK
        uuid chapter_id FK
        uuid scene_id FK
        uuid action_id FK
        uuid micro_action_id FK
    }

    timeline_node_relations {
        uuid id PK
        uuid user_id
        uuid from_node_id
        text from_node_type    "mythos|epoch|era|saga|arc|chapter|scene|action|micro"
        uuid to_node_id
        text to_node_type
        text relation_type
    }

    timeline_events {
        uuid id PK
        uuid user_id
        uuid task_id FK
        text title
        text description
        jsonb context
        timestamptz occurred_at
    }

    %% ── Time index ─────────────────────────────────────────────────────────
    chronology_index {
        uuid id PK
        uuid user_id
        uuid journal_entry_id FK
        text time_precision    "exact | day | month | year | decade"
        int  year_bucket
        date month_bucket
        int  decade_bucket
        timestamptz start_time
        timestamptz end_time
    }

    %% ── Narrative layer ────────────────────────────────────────────────────
    narratives {
        uuid id PK
        uuid user_id
        text type
        text style
        text title
        text summary
        jsonb segments
        jsonb emotional_arc
        text[] themes
        text[] characters
        text status
        timestamptz start_date
        timestamptz end_date
    }

    narrative_accounts {
        uuid id PK
        uuid user_id
        uuid event_record_id FK
        text account_type
        text narrative_text
        uuid source_entry_id FK
        uuid source_message_id FK
    }

    narrative_graphs {
        uuid id PK
        uuid user_id
        jsonb graph_data
        jsonb content_stats_cache
    }

    scenes {
        uuid id PK
        uuid user_id
        uuid memory_id FK      "→ journal_entries"
        text title
        text type
        text setting
        text mood
        jsonb emotional_arc
        jsonb beats
        jsonb characters
        vector embedding
        timestamptz timestamp
    }

    %% ── Relationships ──────────────────────────────────────────────────────
    timeline_mythos   ||--o{ timeline_epochs    : "contains"
    timeline_epochs   ||--o{ timeline_eras      : "contains"
    timeline_eras     ||--o{ timeline_sagas     : "contains"
    timeline_sagas    ||--o{ timeline_arcs      : "contains"
    timeline_arcs     ||--o{ chapters           : "contains"
    chapters          ||--o{ timeline_scenes    : "contains"
    timeline_scenes   ||--o{ timeline_actions   : "contains"
    timeline_actions  ||--o{ timeline_microactions : "contains"

    timelines         }o--o| timelines          : "sub-timeline"
    timelines         ||--o{ timeline_memberships : "includes entries via"
    timelines         ||--o{ timeline_relationships : "relates to (source)"
    timelines         ||--o{ timeline_relationships : "relates to (target)"

    timeline_links    }|--|| chapters           : "places component at chapter"
    timeline_links    }|--|| timeline_arcs      : "places at arc"
    timeline_links    }|--|| timeline_eras      : "places at era"

    journal_entries   ||--o{ chronology_index   : "indexed by time"
    journal_entries   ||--o{ timeline_memberships : "placed in timeline"
    journal_entries   ||--o{ scenes             : "rendered as scene"
    event_records     ||--o{ narrative_accounts : "narrated via"
```

## Temporal hierarchy at a glance

```
timeline_mythos        — the entire life arc / founding myth
  └─ timeline_epochs   — multi-year periods ("college years")
       └─ timeline_eras  — major life phases ("living abroad")
            └─ timeline_sagas  — extended storylines ("building the startup")
                 └─ timeline_arcs   — meaningful chapters ("founding team drama")
                      └─ chapters   — discrete story chapters
                           └─ timeline_scenes  — individual scenes
                                └─ timeline_actions  — specific actions
                                     └─ timeline_microactions  — granular steps
```

| Table | Semantic role |
|---|---|
| `timelines` | User-named collections (flat), self-referencing for sub-timelines |
| `timeline_links` | Bridge that places a memory component at any level of the hierarchy |
| `chronology_index` | Fast time-range queries with bucketed precision |
| `narrative_accounts` | How an event was narrated (same event, multiple tellings) |
| `narrative_graphs` | Graph representation of narrative arcs and connections |
| `scenes` | Rich scene model: beats, characters, emotional arc, embedding |

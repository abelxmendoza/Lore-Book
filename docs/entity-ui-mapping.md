# Entity UI Mapping

**Date:** 2026-06-17  
**Sprint:** Entity Visibility & Auto-Creation  
**Goal:** Every entity type appears where users expect it

---

## Surface inventory

| App surface | Route / trigger | Primary tables |
|-------------|-----------------|----------------|
| Chat | `/chat` | — (displays entities inline) |
| Character Book | `activeSurface: 'characters'` | `characters`, `people_places` |
| Location Book | `activeSurface: 'locations'` | `locations` |
| Organizations Book | `activeSurface: 'organizations'` | `organizations` |
| Events Book | `activeSurface: 'events'` | `events`, `conversation_events` |
| Skills Book | `activeSurface: 'skills'` | `skills` |
| Entity Resolution | `activeSurface: 'entities'` | `omega_entities`, `entities`, conflicts |
| Omni Timeline | `activeSurface: 'timeline'` | `events`, `conversation_events`, timeline entries |
| Life Graph | RAG / working memory | All linked entities (no dedicated book) |
| Goals & Values | Discovery panel | `goals` (mock + partial live) |
| Group Suggestions | Inline / review | `group_candidates` |

---

## Phase 4 — Type → UI mapping

### People

| Ontology type | Storage (canonical) | Storage (legacy) | Primary UI | Secondary UI | Post-chat visibility |
|---------------|---------------------|------------------|------------|--------------|---------------------|
| PERSON | `omega_entities` | `people_places` (person) | — (staging) | Entity Resolution dashboard | **Target:** People group in post-chat panel |
| CHARACTER | `characters` | — | **Character Book** | Character detail modal, Knowledge Base | `EntityChipsRow` (character), `DetectedCharacterSuggestions` |
| Mentioned only | `omega_entities` (`mentioned_only`) | — | — | DetectedCharacterSuggestions | Suggest-create badge |
| Deferred | `entity_questions` | — | — | `EntityClarificationChip`, disambiguation prompt | Inline clarify |
| Unnamed person | `characters` (nickname) | — | Character Book (hidden until opened) | — | **Gap:** not shown post-chat |

**Character Book tabs:** All characters + "Mentioned" (`relationship_depth: mentioned_only`)

**Navigation from chat:** `EntityChipsRow` → `/characters` with `sessionStorage.highlightItem`

---

### Places

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| LOCATION | `omega_entities` | — (staging) | Entity Resolution | Target: Places group |
| Place (book) | `locations` | **Location Book** | Location detail | `EntityChipsRow` (location) |
| Place (legacy) | `people_places` (place) | EntityChipsRow source | — | Current chip source (wrong) |
| Unnamed place | `locations` (nickname) | Location Book | — | **Gap:** silent create |

**Navigation from chat:** `EntityChipsRow` → `/locations`

---

### Organizations

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| ORG | `omega_entities` | — | Entity Resolution | Target: Organizations group |
| Organization (book) | `organizations` | **Organizations Book** | Org detail | `EntityChipsRow` (organization) |
| Platform | `people_places` (platform) | Mapped to organization chip | — | Current chip source |
| Group candidate | `group_candidates` | — | **GroupSuggestions** | Suggest-create |

**Navigation from chat:** `EntityChipsRow` → `/organizations`

---

### Communities

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| Social community | `social_communities` | **None** | Analytics / RAG only | **Gap:** no UI |
| Informal group | `group_candidates` → `organizations` | Organizations Book (after accept) | GroupSuggestions | Suggest-create |

**Recommended placement:** Organizations Book sub-tab "Communities" or dedicated Communities surface (future).

---

### Projects

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| Project mention | Not persisted from chat | **None** | Timeline search (text) | **Gap:** no UI |
| Project (future) | TBD | Projects surface (planned) | Life Graph node | Target: Projects group |

**Recommended placement:** Life Graph project nodes + future Projects Book; Omni Timeline project filter.

---

### Goals

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| Goal | `goals` | **Goals & Values panel** (Discovery) | Character Knowledge Base (goals tab) | **Gap:** no post-chat |
| Quest → goal | `goals` (converted) | Goals panel | Quest UI | — |

**Recommended placement:** Goals group in post-chat panel → Discovery / Goals & Values.

---

### Skills

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| Skill | `skills` | **Skills Book** | Skill profile, RPG views | **Gap:** no post-chat |
| Skill suggestion | Pending queue | Skills Book suggestions | GET `/api/skills/suggestions` | Suggest-create |

**Navigation:** App sidebar → Skills

---

### Events

| Ontology type | Storage | Primary UI | Secondary UI | Post-chat |
|---------------|---------|------------|--------------|-----------|
| EVENT (omega) | `omega_entities` | — | Entity Resolution | Target: Events group |
| Conversation event | `conversation_events` | — | Thread intelligence, continuity cards | Partial (generic labels) |
| Event (book) | `events` | **Events Book** | EventDetailModal | — |
| Event candidate | `event_candidates` | — | Review queue | Suggest-create |
| Timeline entry | timeline tables | **Omni Timeline** | TimelineSearch | — |

**Navigation:** App sidebar → Events; Timeline for chronological view

---

## Life Graph & Timeline cross-cutting

Entities appear in Life Graph indirectly via working memory assembly and RAG — not as a browsable entity index.

| Entity type | Life Graph | Omni Timeline |
|-------------|------------|---------------|
| People | Node (if character promoted) | Mentioned in event context |
| Places | Node (if location promoted) | Location tags on events |
| Organizations | Edge/participant | Org context on events |
| Events | Primary node type | **Primary surface** |
| Relationships | Edge | — |
| Skills | Attribute node | Skill milestones |
| Goals | Intent node | Goal-aligned events |
| Projects | Project node (sparse) | Project-tagged events |

---

## Chat UI placement map

```
┌─────────────────────────────────────────────────────────┐
│  Chat message (user)                                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  [Assistant response]                                │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  TODAY: EntityChipsRow (people_places substring match)   │
│  ┌──────┐ ┌────────┐ ┌─────────┐                        │
│  │ Abuela│ │ Costco │ │ Amazon  │  ← stale/incomplete    │
│  └──────┘ └────────┘ └─────────┘                        │
│                                                          │
│  TARGET: Post-chat extraction panel (NEW)                │
│  ┌─ LoreBook learned ─────────────────────────────────┐ │
│  │ People (2)     Places (1)    Events (1)            │ │
│  │ · Kelly ✓      · Costco ?    · Grad party ?        │ │
│  │ · New: Alex ?                                       │ │
│  │ ✓ = confirmed  ? = suggest  + = auto-created       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  EntityClarificationChip (when defer/disambiguate)       │
│  MemorySuggestion chip (proactive capture)               │
└─────────────────────────────────────────────────────────┘
```

### Component → entity type matrix

| Component | People | Places | Orgs | Communities | Projects | Goals | Skills | Events |
|-----------|--------|--------|------|-------------|----------|-------|--------|--------|
| `EntityChipsRow` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `DetectedCharacterSuggestions` | ✅ suggest | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `DetectedLocationSuggestions` | ❌ | ✅ suggest | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `GroupSuggestions` | ❌ | ❌ | ✅ suggest | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| `EntityClarificationChip` | ✅ defer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ThreadEntityChips` | ✅ focus | ✅ focus | ✅ focus | ❌ | ❌ | ❌ | ❌ | ❌ |
| Skills suggestions API | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ suggest | ❌ |
| Events Book | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ book |
| Entity Resolution Book | ✅ all tiers | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Book → storage → creation path

| Book | Table | Created by | Visible without user action? |
|------|-------|------------|------------------------------|
| Character Book | `characters` | Promotion, manual, nickname, clarify | Nickname yes (hidden); promotion after 2 mentions |
| Location Book | `locations` | Nickname, suggestion accept, manual | Nickname yes (hidden) |
| Organizations Book | `organizations` | Group accept, manual | No |
| Events Book | `events` | Engine, candidate accept | No |
| Skills Book | `skills` | Extraction, suggestion confirm | Journal path yes |
| Entity Resolution | `omega_entities` + legacy | All extraction | Only confirmed/PRIMARY tier |
| Goals panel | `goals` | Quest conversion | No |
| Timeline | events + entries | Event recovery | Auto (read-only) |
| Life Graph | assembled | WMA / graph query | Auto (read-only, chat context) |

---

## Provenance display by surface

| Surface | Source conversation | Evidence count | Confidence | Creation source |
|---------|--------------------:|---------------:|-----------:|-------------------|
| Character Book card | ❌ | ❌ | ❌ | ❌ |
| Character detail / Knowledge Base | ⚠️ partial | ⚠️ facts | ⚠️ fact confidence | ❌ |
| EntityChipsRow | ❌ | ❌ | ❌ | ❌ |
| DetectedCharacterSuggestions | ⚠️ source label | ❌ | ❌ | ✅ "Detected person" |
| Entity Resolution dashboard | ✅ | ✅ mention count | ✅ tier | ✅ |
| **Target post-chat panel** | ✅ | ✅ | ✅ | ✅ |

Entity Resolution dashboard is the only surface today with full provenance — but it hides `mentioned_only` entities.

---

## Implementation priority

| Priority | Mapping gap | Target surface |
|----------|-------------|----------------|
| P0 | Post-chat panel for all extracted types | Chat (new component) |
| P0 | Fix EntityChipsRow data source | Chat (existing) |
| P1 | Communities → Organizations sub-tab or new book | Organizations / Communities |
| P1 | Projects extraction → Life Graph + future book | Life Graph |
| P1 | Goals post-chat → Discovery panel link | Chat + Goals |
| P2 | Provenance on Character/Location cards | Books |
| P2 | Events in post-chat panel | Chat + Events Book |
| P2 | Skills in post-chat panel | Chat + Skills Book |

---

## Key files

| Area | Path |
|------|------|
| App routing / surfaces | `apps/web/src/pages/App.tsx` |
| Entity chips | `apps/web/src/features/chat/message/EntityChipsRow.tsx` |
| Thread entity focus | `apps/web/src/features/chat/components/ThreadEntityChips.tsx` |
| Character book | `apps/web/src/components/characters/CharacterBook.tsx` |
| Character suggestions | `apps/web/src/components/characters/DetectedCharacterSuggestions.tsx` |
| Location book | `apps/web/src/components/locations/LocationBook.tsx` |
| Organizations book | `apps/web/src/components/organizations/OrganizationsBook.tsx` |
| Events book | `apps/web/src/components/events/EventsBook.tsx` |
| Skills book | `apps/web/src/components/skills/SkillsBook.tsx` |
| Entity resolution UI | `apps/web/src/components/entities/EntityResolutionBook.tsx` |
| Timeline | `apps/web/src/components/timeline/OmniTimeline.tsx` |
| Goals panel | `apps/web/src/components/discovery/GoalsAndValuesPanel.tsx` |

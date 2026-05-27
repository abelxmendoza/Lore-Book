# Canonical Conversation Workspace Architecture
_Lorekeeper · Runtime Design · 2026-05-26_

## Product North Star

The conversation workspace should feel like **returning to a known place** — not launching a chatbot. The workspace holds the user's world stable. Navigation, continuity signals, and persistence state are always present but never intrusive.

---

## Layer Map

```
┌─────────────────────────────────────────────────────────────────┐
│  ConversationSidebar                                            │
│  ─────────────────────────────────────────────────────────────  │
│  • Thread list as narrative memory index                        │
│  • Thread title + subtitle + dominant entity chips              │
│  • Date grouping (Today / Yesterday / Previous 7 days / Older)  │
│  • Collapsed icon-only mode for desktop focus                   │
│  • Mobile left-side drawer with swipe-to-close                  │
└───────────────────┬─────────────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────────────┐
│  ConversationWorkspace                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ThreadContextBar                                        │   │
│  │  • Thread title (editable inline)                       │   │
│  │  • Subtitle (quiet, readable)                           │   │
│  │  • ThreadSaveChip (cloud backed / local only / syncing) │   │
│  │  • Return-to-thread idle gap indicator (when applicable)│   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MessageList                                             │   │
│  │  • Streaming assistant responses                        │   │
│  │  • User messages with entity chips (recognized people)  │   │
│  │  • ContinuityAcknowledgedChip on persistence moments    │   │
│  │  • Sources / connections / timeline updates             │   │
│  │  • Mode attribution badge (Archivist / Therapist etc.)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ContinuitySignalsLayer  (non-blocking overlay)          │   │
│  │  • Entity recognition chips (post-send, on user msgs)   │   │
│  │  • Timeline contribution indicator (→ Added to …)       │   │
│  │  • Memory trust signal (cloud backed / offline)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ChatComposer                                            │   │
│  │  • Text input                                           │   │
│  │  • Submit / voice                                       │   │
│  │  • Context chip (timeline node / entity focus)          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### ConversationSidebar
**Purpose**: Narrative memory index — not chat storage.

- Renders `ChatThreadList` with thread groups
- Each thread item: title + subtitle + dominant entity chips + timestamp
- Collapsed mode: icon-only (8 most recent threads)
- Mobile: full-height left drawer, swipe-to-close

**Data owned**: Thread list, current thread selection, rename/delete interactions

**Must not**: Show per-message detail, stream state, or cognition panels

---

### ThreadContextBar
**Purpose**: Persistent orientation — where am I, what is this conversation about, is it safe.

- Thread title (inline rename on double-click / long-press)
- Subtitle (quiet, always visible when set)
- `ThreadSaveChip`: cloud backed / local only / not backed up — stability language, not save-progress language
- Returns-to-thread gap notice (injected when thread idle > 24h — shown only on first message)

**Data owned**: Active thread identity, persistence state, idle gap awareness

**Must not**: Show entity analytics, RAG stats, or cognition panels (those belong in MessageList metadata)

---

### MessageList
**Purpose**: Conversation history with grounded continuity signals embedded in message context.

- Streaming assistant message rendering
- User messages: message content + (Phase 3) recognized entity chips below
- Assistant messages: content + optional sources / connections / continuity warnings / timeline updates
- `ContinuityAcknowledgedChip`: appears inline when system detected and acknowledged a persistence intent
- Mode attribution badge: quiet `Archivist` / `Therapist` / `Strategist` label
- Cognitive observability panels: collapsed by default, expandable for power users

**Data owned**: Message rendering, streaming state, metadata display per message

**Must not**: Manage thread persistence state or sidebar navigation

---

### ContinuitySignalsLayer
**Purpose**: Non-blocking overlay that surfaces continuity without interrupting conversation flow.

Currently implemented via inline message metadata. Phase 3 adds:
- Entity recognition chips on sent user messages (known / recurring / new)
- Timeline contribution indicator at bottom of thread (→ Added to Lorekeeper creation journey)

**Principle**: All signals must be dismissible, never modal, never blocking.

---

### ChatComposer
**Purpose**: Input surface. Nothing more.

- Text area with auto-resize
- Submit on Enter (configurable)
- Optional context chip showing current focus (timeline node or entity)

---

## Separation of Concerns

| Concern | Owned by |
|---|---|
| Thread list navigation | ConversationSidebar |
| Thread identity + persistence trust | ThreadContextBar |
| Conversation history + cognition signals | MessageList |
| Non-blocking continuity overlays | ContinuitySignalsLayer |
| Text input | ChatComposer |
| AI response streaming | omegaChatService (server) → useChat (client) |
| Thread persistence state machine | threadPersistenceTracker → usePersistenceState |
| Entity recognition | ingestion pipeline (async) → dominantEntities on thread |

---

## Continuity Surfacing Principles

**Sparse authentic continuity > synthetic emotional richness.**

1. **Quiet by default** — all continuity signals should be visible but not attention-demanding. If the user has to think "why is that there", it's too loud.
2. **Grounded in real data** — only signal what the system actually knows. No invented warmth, no synthetic summaries that aren't backed by extracted entities or events.
3. **Revisitation over presentation** — the goal is that the user feels the system remembers, not that the system tells them it remembers.
4. **Time awareness** — idle gaps should be acknowledged naturally in conversation context, not as UI banners.
5. **Never modal** — continuity signals must never block conversation flow.

---

## Current Fragility Points

| Area | Fragility | Recommended Fix |
|---|---|---|
| `dominantEntities` population | Async after ingestion — new threads show no chips until pipeline runs | Accept latency; chips appear on next thread load after pipeline completes |
| Return-to-thread injection | Only fires in main `chatStream` path, not in entity-scoped chat or recall handlers | Extend idle orientation to the entity chat path in a follow-up pass |
| Subtitle generation | Tied to title generation on first AI response — threads that never get a title have no subtitle | Trigger subtitle generation independently of title when conversation reaches 3+ messages |
| Entity chips on user messages (Phase 3) | Not yet implemented — requires recognized entity list from message metadata or a post-send lookup | Implement via post-send async entity lookup against user's known entities |
| Timeline contribution display (Phase 5) | Ingestion pipeline doesn't yet surface which timeline entries a thread contributed to | Add `contributed_timeline_ids` to thread metadata in the ingestion writer |

---

## Highest-ROI Next Continuity Loops to Close

1. **Entity chips on user messages** (Phase 3) — visually confirms the system already knows a person. Highest "aha" moment per implementation cost.
2. **Timeline contribution indicator** (Phase 5) — closes the conversation→timeline loop. Makes the user feel their words are accumulating into something.
3. **Subtitle generation decoupled from title** — subtitles are the single most readable continuity signal in the thread list. More threads should have them.
4. **Event continuity modeling** (Phase 6) — grouping related interactions into narrative events is the next cognition frontier after entity persistence.
5. **Provenance edge tightening** (Phase 7 follow-up) — add direct `user_id` to `provenance_edges` before scaling to multi-user production.

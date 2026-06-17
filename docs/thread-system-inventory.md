# Thread System Inventory

**Audit date:** 2026-06-16  
**Scope:** Chat threads vs narrative threads — routes, services, stores, database truth

---

## Executive Summary

LoreBook has **two unrelated thread systems** that share product language but not data:

| System | API Mount | DB Table | UI | Canonical for |
| --- | --- | --- | --- | --- |
| **Chat threads** | `/api/conversation/threads/*` | `conversation_sessions` | Chat sidebar, `/chat/:id` | **ChatGPT-like chat** ✅ |
| **Narrative threads** | `/api/threads/*` | `threads` | Timeline hierarchy, lore context | **Life-graph themes** ✅ |

No HTTP path collisions today (different prefixes). Confusion is **naming and dual message caches**, not route overlap.

---

## Phase 1 — Route Inventory

### A. Chat threads — `/api/conversation` (`conversationCentered.ts`)

**Mount:** `CORE_RUNTIME`, protected, 64 routes total.

#### Thread CRUD & durability (canonical chat surface)

| Method | Path | Purpose | Callers | Active? | Duplicate? |
| --- | --- | --- | --- | --- | --- |
| GET | `/threads` | List sessions (sidebar order by `updated_at`) | `useChatThreads`, HomeScreen | ✅ | — |
| POST | `/threads` | Create session / reuse empty draft | `useChatThreads` | ✅ | — |
| PATCH | `/threads/:id` | Update title, `metadata.messages`, `touchActivity` | `useChatThreads` | ✅ | Overlaps POST title routes |
| DELETE | `/threads/:id` | Delete session + messages | `useChatThreads` | ✅ | — |
| GET | `/threads/:id/messages` | Load merged messages | `useChatThreads` hydrate | ✅ | Canonical read |
| POST | `/threads/:id/ensure-visible` | Orphan recovery **without** `updated_at` bump | `useChatThreads` | ✅ | — |
| GET | `/threads/:id/status` | Protected / recoverable status | `useConversationRuntime` | ✅ | — |
| POST | `/threads/:id/title` | Auto-generate title (LLM) | `useConversationRuntime` | ✅ | — |
| PATCH | `/threads/:id/title` | Manual rename | `useChatThreads` | ✅ | — |
| POST | `/threads/:id/fork` | Fork at message | `useConversationRuntime` | ✅ | — |
| POST | `/threads/:id/end` | End session | — | ⚠️ | Low UI use |
| GET | `/threads/:id/context` | Rich thread index | `threadExplorer` API | ✅ | — |
| GET | `/threads/:id/units` | Extracted units | — | ⚠️ | Dev/diagnostics |
| GET | `/threads/explore` | Knowledge-aware search | `useThreadExplorer` | ✅ | Canonical search |
| GET | `/threads/facets` | Entity/subtitle facets | `useThreadExplorer` | ✅ | — |
| POST | `/threads/recover-orphans` | Recreate sessions from orphan messages | `useChatThreads` boot | ✅ | — |
| DELETE | `/threads/empty` | Purge stale empty drafts | `useChatThreads` boot | ✅ | — |
| DELETE | `/threads/dedupe` | Remove duplicate threads | `useChatThreads` boot | ✅ | — |
| POST | `/threads/backfill-entity-links` | Entity link recovery | — | ⚠️ | Admin/recovery |

#### Conversation intelligence (same router, not thread CRUD)

Events, traces, romantic relationships, skill network, character timelines, greeting, what-changed — **52 additional routes**. These are conversation-centered lore APIs, not thread list operations. **Keep on `/api/conversation`**, not merged into `/api/threads`.

---

### B. Narrative threads — `/api/threads` (`threads.ts`)

**Mount:** `CORE_RUNTIME`, protected, 16 routes.

| Method | Path | Purpose | Callers | Active? | Duplicate? |
| --- | --- | --- | --- | --- | --- |
| GET | `/` | List life-graph threads | TimelineHierarchyPanel, OmniTimelinePanel | ✅ | Name collision only |
| POST | `/` | Create narrative thread | — | ⚠️ | — |
| GET | `/:id` | Get thread | CurrentContextBreadcrumbs | ✅ | — |
| PATCH | `/:id` | Update name/description | — | ⚠️ | — |
| DELETE | `/:id` | Delete | — | ⚠️ | — |
| GET | `/:id/timeline` | Saga/arc nodes in thread | ThreadTimelineView | ✅ | — |
| GET | `/:id/interruptions` | Overlapping nodes | ThreadTimelineView | ✅ | — |
| POST/DELETE | `/:id/members*` | Saga/arc membership | TimelineNodeDetailModal | ✅ | — |
| POST | `/:id/entries` | Link journal entry | useLoreKeeper | ✅ | — |
| GET/POST/DELETE | `/nodes/*`, `/node-relations` | Node context & causality | TimelineNodeDetailModal | ✅ | — |

**Verdict:** Not duplicate of chat threads — **different ID namespace, different product concept**. Must be **renamed** (not merged) to eliminate confusion.

---

## Phase 1 — Service Inventory

### Chat thread services (`services/conversationCentered/` + `services/chat/`)

| Service | File | Purpose | Callers | Active? | Canonical? |
| --- | --- | --- | --- | --- | --- |
| **threadContentService** | `threadContentService.ts` | Merge `chat_messages` + `conversation_messages` + `metadata.messages` | Routes, recovery | ✅ | **Message read path** |
| **threadIntelligenceService** | `threadIntelligenceService.ts` | `metadata.threadMeta` — people, places, projects, episodes, open loops | Ingestion, omega chat | ✅ | **Intelligence truth** |
| **threadSummaryService** | `threadSummaryService.ts` | Incremental LLM summaries in `threadMeta` | Ingestion, intelligence | ✅ | **Summary truth** |
| **threadRecoveryService** | `threadRecoveryService.ts` | Durability audit/repair; `chat_messages` canonical | Diagnostics | ✅ | **Repair path** |
| **threadDurabilityChecks** | `threadDurabilityChecks.ts` | Pure helpers (ordering, dedupe) | Recovery, tests | ✅ | Shared lib |
| **conversationTitleService** | `chat/conversationTitleService.ts` | Title/subtitle generation + rename | Routes, runtime | ✅ | **Title truth** |
| **threadExplorerService** | `threadExplorerService.ts` | Explore search, facets, context | Routes | ✅ | **Search truth** |
| **threadDedupeService** | `threadDedupeService.ts` | Dedup, empty draft reuse | Routes, boot | ✅ | — |
| **entityConversationLinkService** | `entityConversationLinkService.ts` | Entity ↔ session links | Delete guard | ✅ | — |
| **threadRecallService** | `chat/threadRecallService.ts` | In-thread “what did I say?” recall | Chat pipeline | ✅ | Subset of content |
| **conversationService** | `conversationService.ts` | Legacy session CRUD, `conversation_messages` | Partial | ⚠️ | **MERGE** into content service |

### Narrative thread services (`services/threads/`)

| Service | Purpose | Canonical? |
| --- | --- | --- |
| `threadService.ts` | CRUD on `threads` table | ✅ for life-graph |
| `threadMembershipService.ts` | Saga/arc membership | ✅ |
| `threadTimelineService.ts` | Ordered timeline | ✅ |
| `nodeRelationService.ts` | Node causality | ✅ |
| `threadAssignmentService.ts` | Batch assignment | ⚠️ v1 manual |

**No merge with chat services** — separate bounded context.

---

## Phase 1 — Client Store Inventory

| Hook / Store | File | Owns | API calls | Active? | Duplicate? |
| --- | --- | --- | --- | --- | --- |
| **useConversationStore** | `useConversationStore.ts` | Live `messages[]` only | None | ✅ | Intentional display cache |
| **useChatThreads** | `useChatThreads.ts` | Thread list + message snapshots | `/api/conversation/threads/*` | ✅ | Persist cache |
| **useConversationRuntime** | `useConversationRuntime.ts` | URL lifecycle, `touchActivity`, titles | + status, greeting, fork, title | ✅ | Orchestrator only |
| **useChat** | `useChat.ts` | Send/stream via store | `/api/chat/stream` | ✅ | — |
| **useThreadExplorer** | `useThreadExplorer.ts` | Search hits/facets | `/threads/explore`, `/facets` | ✅ | Search UI cache |
| **threadPersistenceTracker** | `threadPersistenceTracker.ts` | Save-state metadata | None | ✅ | Not a message cache |
| **HomeScreen** (inline) | `HomeScreen.tsx` | Recent 3 threads | `GET /threads?limit=3` | ✅ | **Duplicate cache** |
| **CharacterBook store** | `CharacterBook.tsx` | Isolated empty store | None | ⚠️ | **Broken isolation** |

### Intended client architecture (already mostly correct)

```
useConversationStore  →  live messages (fast, ephemeral)
useChatThreads        →  thread list + snapshots (persisted)
useConversationRuntime →  bridge + touchActivity + URL
useChat               →  stream + append to store
```

---

## Phase 2 — Source of Truth

### Chat threads

| Layer | Table / field | Role | Canonical? |
| --- | --- | --- | --- |
| **Thread row** | `conversation_sessions` | id, title, `updated_at`, `metadata` | ✅ Thread identity |
| **Live messages** | `chat_messages` | Turns from `/api/chat/stream` | ✅ **Primary message truth** |
| **Ingestion messages** | `conversation_messages` | Pipeline path | Secondary; merged on read |
| **Client snapshot** | `metadata.messages` | Debounced PATCH from UI | **Derived** — repair target |
| **Intelligence** | `metadata.threadMeta` | people, places, summaries, open loops | ✅ Intelligence truth |
| **Title governance** | `title`, `metadata.titleSource`, `subtitle` | Title service | ✅ Title truth |

**Recovery contract** (`threadRecoveryService`):

> Treat `chat_messages` as canonical. Rebuild `metadata.messages` from it. Never delete messages.

**Read contract** (`threadContentService.loadThreadMessages`):

> Merge all three message sources; prefer `chat_messages` IDs over metadata fingerprints.

### Narrative threads

| Layer | Table | Canonical? |
| --- | --- | --- |
| Thread | `threads` | ✅ |
| Membership | `thread_memberships` | ✅ |
| Entry links | `entry_thread_links` | ✅ |

**No overlap with chat message tables.**

---

## Phase 5 — Thread Ordering (verified)

| Behavior | Implementation | Status |
| --- | --- | --- |
| Message activity moves thread up | Client: `touchActivity: true` → sort + PATCH; Server: bumps `updated_at` | ✅ |
| Opening thread does NOT reorder | `ensure-visible` explicitly avoids bump; hydrate without `touchActivity` | ✅ |
| Refresh preserves order | List `GET /threads` ordered by `updated_at` desc; no bump on load | ✅ |
| Stream completes bump activity | `useConversationRuntime` sync effect on stream end | ✅ |
| Server list order | `conversationCentered` GET `/threads` sorts by `updated_at` | ✅ |

---

## Phase 6 — Thread Intelligence (verified)

Stored in `conversation_sessions.metadata.threadMeta` via `threadIntelligenceService`:

| Field | Source | Status |
| --- | --- | --- |
| **summary** (short/medium/long) | `threadSummaryService` → `threadMeta` | ✅ Live |
| **continuity card** | `buildContinuityCard(threadMeta)` — deterministic | ✅ Live |
| **people** | Ingestion `updateOnMessage` | ✅ Live |
| **places** | Ingestion | ✅ Live |
| **projects** | Ingestion | ✅ Live |
| **episodes** | Ingestion (`episodeId`) | ⚠️ Partial — depends on extraction quality |
| **open_loops** | Ingestion + durability check | ⚠️ Partial |
| **themes** | Ingestion | ✅ Live |
| **message_count** | Incremental merge | ✅ Live |

**Dead / unused:** No separate thread intelligence table. Legacy `metadata.narrativeThemes` (client contract) overlaps with `threadMeta.themes` — **MERGE** documentation only.

**Consumers:** `omegaChatService` (continuity card in chat), ingestion pipeline, thread explorer context.

---

## Phase 7 — Thread Search Index

| Search type | Canonical path | Backend | UI |
| --- | --- | --- | --- |
| **Sidebar title filter** | Client-only substring on loaded threads | — | ChatThreadList |
| **Cross-thread explore** | `GET /api/conversation/threads/explore` | `threadExplorerService` | useThreadExplorer |
| **Faceted navigation** | `GET /api/conversation/threads/facets` | `threadExplorerService` | ChatThreadList |
| **Thread context panel** | `GET /api/conversation/threads/:id/context` | `threadExplorerService` | threadExplorer API |
| **Message text in thread** | `GET /api/conversation/threads/:id/messages` | `threadContentService` | Hydrate |
| **Universal search** | `POST /api/search/universal` | search router | TimelineSearch (broader) |

**Canonical retrieval for chat threads:** `threadExplorerService` for discovery, `threadContentService` for messages, `conversation_sessions.updated_at` for ordering.

**Duplicate to eliminate:** Client `metadata.messages` search vs server explore — prefer server explore for cross-thread; in-thread search should query messages endpoint or explore with `threadId` filter.

---

## Phase 8 — KEEP / MERGE / DELETE Summary

### Routes

| Item | Verdict |
| --- | --- |
| `/api/conversation/threads/*` | **KEEP** — canonical chat thread API |
| `/api/conversation/*` (events, traces, etc.) | **KEEP** — conversation lore, not thread CRUD |
| `/api/threads/*` | **KEEP** → **RENAME** to `/api/narrative-threads` or `/api/timeline/threads` |
| `/api/diagnostics/thread-health*` | **MERGE** → `/api/conversation/threads/health` (P2) |

### Services

| Item | Verdict |
| --- | --- |
| threadContentService | **KEEP** |
| threadIntelligenceService + threadSummaryService | **KEEP** (already consolidated) |
| threadRecoveryService | **KEEP** |
| conversationTitleService | **KEEP** |
| threadExplorerService | **KEEP** |
| conversationService (overlap) | **MERGE** into threadContentService (P2) |
| services/threads/* | **KEEP** (separate domain) |

### Client stores

| Item | Verdict |
| --- | --- |
| useConversationStore | **KEEP** (live messages) |
| useChatThreads | **KEEP** (thread list) |
| useConversationRuntime | **KEEP** (orchestrator) |
| HomeScreen recent threads fetch | **MERGE** into shared thread query (P1) |
| CharacterBook useConversationStore | **DELETE** isolation — pass messages via props (P1) |
| Guest localStorage thread cache | **KEEP** until guest mode removed |

### Metadata paths

| Path | Verdict |
| --- | --- |
| `chat_messages` | **KEEP** — canonical |
| `metadata.messages` | **KEEP** short-term as derived snapshot; stop dual-authority (P1) |
| `metadata.threadMeta` | **KEEP** — intelligence canonical |
| `conversation_messages` | **KEEP** for ingestion; merged on read |

---

## Architecture Target (North Star)

```
                    ┌─────────────────────────────────────┐
                    │     GET /api/conversation/threads    │  ← rename to /api/threads (chat) later
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
 conversation_sessions          chat_messages              metadata.threadMeta
     (thread row)            (message truth)           (intelligence + summaries)
          │                           │
          └──── metadata.messages ◄───┘  (derived snapshot, rebuilt on repair)

     GET /api/narrative-threads/*  (renamed from /api/threads)
                    │
               threads table  (life-graph — separate domain)
```

**One thread API (chat), one cache (useChatThreads + useConversationStore), one message truth (`chat_messages`), one search path (`threads/explore`).**

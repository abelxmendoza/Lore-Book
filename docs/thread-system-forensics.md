# Thread System Forensics + Consolidation Plan

Builds on `thread-durability-audit.md` and `state-management-audit.md`. Mission: threads/conversations/memory/UI behave like **one** ChatGPT-grade system, not stitched-together parts.

---

## Phase 1 — The single diagram (one lifecycle, all sources of truth)

```
                          ┌──────────────────────────── CLIENT ────────────────────────────┐
  user types ──▶ useChat ─┤ optimistic add → useConversationStore.messages (active array)   │
                          │                  + useChatThreads per-thread messages (DUP) 🔴   │
                          └───────────────┬─────────────────────────────────────────────────┘
                                          │ POST /api/chat/stream
                                          ▼
   ┌──────────────────────────────────── SERVER ─────────────────────────────────────────────┐
   │ 1. user msg ─▶ chat_messages(role=user)         [canonical]   ◀── persisted BEFORE gen   │
   │ 2. OpenAI stream ─▶ SSE chunks ─▶ client                                                  │
   │ 3. assistant ─▶ chat_messages(role=assistant)   [canonical]   ◀── durable: done/partial/ │
   │                 + bump conversation_sessions.updated_at        failed (Durability Sprint) │
   │ 4. async ingestion ─▶ conversation_messages      [PROJECTION]  (lags; not authoritative)  │
   │ 5. legacy snapshot ─▶ sessions.metadata.messages [SNAPSHOT]    (drifts; rebuilt by repair)│
   └───────────────┬──────────────────────────────────────────────────────────────────────────┘
                   │ GET /threads (ORDER BY updated_at DESC)   GET /threads/:id/messages
                   ▼                                                   │ loadThreadMessages
        sidebar ◀──┘ (thread metadata only)                           ▼ merge 3 sources 🔴
                                                            hydrate ◀──┘ (chat_messages should win)
```

| Stage | Source of truth | Storage | Client store | Race / dup |
|---|---|---|---|---|
| Thread create | `conversation_sessions` | sessions | `useChatThreads` | dup with `useConversationStore` for active thread |
| Message send | **`chat_messages`** | chat_messages | `useConversationStore` (+dup) | optimistic id `user-…` ≠ DB id |
| Assistant stream | **`chat_messages`** (post-Durability fix) | chat_messages | accumulate in route | mid-stream crash → now persists partial |
| Persistence | **`chat_messages`** | chat_messages + (projection) conversation_messages + (snapshot) metadata.messages | — | 3 representations 🔴 |
| Hydration | should be `chat_messages` | merges 3 | `useChatThreads` | merge dedups by role+content |
| Sidebar | `conversation_sessions.updated_at` | sessions | `useChatThreads` | double JS sort 🔴 |
| Thread select | client | — | both stores | opening must NOT reorder |
| Ordering | `updated_at DESC` | sessions | client | bump on user send + assistant done |
| Reload / refresh | server | chat_messages + sessions | rehydrate | order preserved if updated_at correct |
| Multi-tab | server | chat_messages | per-tab stores | no cross-tab sync (P3) |

---

## Phase 2 + 10 — Source-of-truth: KEEP / MERGE / DELETE

| Representation | Disposition | Rationale |
|---|---|---|
| `chat_messages` | **KEEP — canonical** | the immutable, immediately-written log; every guarantee derives from it |
| `conversation_sessions` | **KEEP — canonical thread store** | one row per thread; `updated_at` = ordering authority |
| `conversation_messages` | **MERGE → projection** | keep only as the async-ingestion output; never an authoritative hydration source |
| `conversation_sessions.metadata.messages` (snapshot) | **DELETE (as source) / keep as cache** | drifts; `threadRecoveryService.repairThread` rebuilds it from `chat_messages`. Hydration must not depend on it |
| `useConversationStore.messages` (client) | **MERGE → one cache** | active-thread array; fold into the single `threadId→Message[]` cache |
| `useChatThreads` per-thread `messages` (client) | **MERGE → one cache** | duplicate of the above; same cache |
| 3-source hydration merge | **KEEP as recovery fallback only** | primary read = `chat_messages`; merge stays for repair |
| legacy retrieval routers (`recallQueryRouter` ×2 paths) | **DELETE → Working Memory Assembler** | the WMA is now the single retrieval entry; the old routers are superseded |

**Net:** one canonical message store (`chat_messages`), one canonical thread store (`conversation_sessions`), one client cache (`threadId→messages`), one retrieval entry (`assembleWorkingMemory`). Everything else is a projection or a recovery fallback.

---

## Phase 3 — ChatGPT thread behavior (status)

| Rule | Status |
|---|---|
| Most-recently-active rises to top | ✅ `updated_at DESC`; assistant completion bumps it (Durability fix) |
| Opening a thread does NOT reorder | ✅ server never bumps on read; client must not optimistically reorder on open |
| Sending a message DOES reorder | ✅ user-msg persist + assistant bump |
| Assistant completion updates timestamp | ✅ Durability fix |
| Partial stream updates timestamp | ✅ Durability fix persists partial + bumps |
| Reload / refresh preserves order | ✅ from `updated_at` |
| New message immediately visible | ✅ optimistic add → reconcile with `chat_messages` |
| No disappearing threads / responses | ✅ once route wiring lands; `threadRecoveryService` repairs historical drift |

## Phase 4 — Message durability (status)

"If the user sees text, it exists in storage": user msg persisted **before** generation; assistant persisted on done **and** partial **and** error/disconnect with a `stream_status`; `threadRecoveryService` rebuilds any thread from `chat_messages`. No user-only conversations once the route fix lands. (Durability Sprint.)

## Phase 5 — State ownership (consolidation plan)

Two client arrays own the same messages (`useConversationStore` + `useChatThreads`). **Plan:** one `Map<threadId, Message[]>` cache; active conversation and per-thread views are **selectors** over it (not copies); sidebar holds metadata only; server `chat_messages` reconciles on hydrate (server wins). Detailed in `state-management-audit.md`.

## Phase 6 — Recovery (expanded this sprint)

`threadRecoveryService` now also detects **broken_titles, orphan_threads, empty_threads, duplicate_threads** and **deterministically repairs broken titles** from the first user message (`deriveTitleFromMessages` — never "New Conversation"; never overwrites a user-renamed title). Plus the existing orphaned-message / missing-assistant / drift / ordering detection + snapshot/ordering repair.

## Phases 7–9 — Already in place

- **Titles (7):** `conversationTitleService` (LLM) + `threadTitleUtils` (deterministic, generic-title guard `isGenericThreadTitle`, default `Draft`, never "New Conversation"). Recovery now repairs any that slipped through.
- **Thread intelligence (8):** thread metadata + the Working Memory Assembler already resolve people/places/entities per thread; surface them in sidebar hover next (cheap projection over `entity_conversation_links` + WMA entities).
- **Chat-trace (9):** `assembleWorkingMemory` exposes `selected` / `rejected` (with `rejectedReason`) / `entities` / `budget`, and `buildWorkingMemoryPacket` the final context — wired at `/api/diagnostics/working-memory`. This already answers "why did recall fail?" in one call.

---

## Success criteria → where each is met

| Criterion | Mechanism |
|---|---|
| Threads never disappear | `chat_messages` canonical + `threadRecoveryService` + `isThreadProtected` |
| Responses never disappear | durable assistant persistence (done/partial/error) |
| Ordering matches activity | `updated_at` bumped on every persisted message; `ORDER BY updated_at DESC` |
| Refresh never loses history | hydrate from `chat_messages` |
| Recall failures explainable | WMA `rejected[].rejectedReason` + packet via `/diagnostics/working-memory` |
| Feels like ChatGPT | single source of truth (this plan) + the Durability guarantees |

**Remaining to finish the mission:** land the route wiring (durable persistence + thread-health, sitting in the working tree), collapse the two client stores into one cache (Phase 5), and make hydration read `chat_messages` first (merge as fallback). Those three close the gap to "behaves identically to ChatGPT."

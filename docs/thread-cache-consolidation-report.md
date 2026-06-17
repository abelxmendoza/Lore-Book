# Thread Cache Consolidation Report (P1)

**Date:** 2026-06-16  
**Sprint:** Thread Consolidation P1 — client state dedup  
**Prerequisite:** [thread-consolidation-roadmap.md](./thread-consolidation-roadmap.md)

---

## Summary

P1 eliminated duplicate client-side chat thread state. One `ChatThreadProvider` now owns the canonical cache; `useConversationStore` is an adapter; `useConversationRuntime` is orchestration-only.

---

## Phase 1 — Client State Trace (Before)

| Hook | Owned | Mutations | Problem |
| --- | --- | --- | --- |
| **useChatThreads** | Thread list + `threads[].messages` | CRUD, hydrate, debounced PATCH | ✅ Canonical persist cache |
| **useConversationStore** | Separate `messages[]` (useState) | add/update/remove | ❌ Duplicate live copy |
| **useConversationRuntime** | Orchestration + **sync effect** | Copied store → threads | ❌ Bridge duplicated state |
| **HomeScreen** | Independent `recentThreads` state | `GET /threads?limit=3` | ❌ Third cache |
| **CharacterBook** | Isolated `useConversationStore()` | — | ❌ Always empty |

### Duplicate paths removed

| Path | Before | After |
| --- | --- | --- |
| Message storage | `useConversationStore.messages` + `threads[].messages` | `threads[].messages` only |
| Message sync | Runtime `useEffect` on every chunk | Direct writes via `updateActiveMessages` |
| Recent threads | HomeScreen independent fetch | `useRecentChatThreads()` from cache |
| Character extraction | Isolated store instance | `useActiveChatMessages()` from cache |
| Ordering | Runtime sync detected touchActivity | `useChat` passes `touchActivity` explicitly |

---

## Phase 2 — Canonical Cache Design

```
ChatThreadProvider (app root)
  └── useChatThreads()          ← single instance
        ├── threads[]           ← thread list + messages + metadata
        ├── activeThreadId      ← URL-driven display pointer
        └── activeMessages      ← derived view of active thread

useConversationStore            ← adapter (no useState for messages)
useConversationRuntime          ← orchestration only (no storage)
useChat                         ← mutations via adapter + touchActivity flags
```

**Survivor:** `useChatThreads` inside `ChatThreadProvider`  
**Adapter:** `useConversationStore` (reads `activeMessages`, writes `updateActiveMessages`)  
**Orchestrator:** `useConversationRuntime` (URL, navigation, title, greeting)

---

## Phase 3 — Ordering Consolidation

Single ordering path via `useChatThreads.updateThread({ touchActivity: true })`:

| Event | touchActivity | Location |
| --- | --- | --- |
| User sends message | ✅ true | `useChat` → `addMessage(..., { touchActivity: true })` |
| Stream completes | ✅ true | `useChat` → `updateMessage(..., { touchActivity: true })` |
| Streaming chunks | ❌ false | Default (no flag) |
| Open/switch thread | ❌ false | Runtime sets `activeThreadId` only |
| Hydration | ❌ false | `hydrateThreadMessages` preserves server `updated_at` |
| Thread switch baseline | ❌ false | Removed (no sync effect) |

**Removed:** ~50-line sync effect in `useConversationRuntime` that duplicated ordering logic.

---

## Phase 4 — Fetch Consolidation

| Fetch | Before | After |
| --- | --- | --- |
| Thread list boot | `useChatThreads.loadFromBackend` | Unchanged (single path) |
| HomeScreen recent | `GET /threads?limit=3` duplicate | Slice of cached `threads` |
| Message hydrate | `hydrateThreadMessages` | Unchanged (single path) |
| URL hydration | Runtime + handler both called `setMessages` | Both call `setActiveThreadId` + cache |

---

## Phase 5 — Runtime Consolidation

`useConversationRuntime` no longer accepts `{ messages, setMessages, clearMessages }`.

**Retained responsibilities:**
- URL-driven hydration
- Navigation handlers (new/select/delete/fork)
- Semantic title generation
- Return greeting fetch
- Flush-before-switch durability

**Removed responsibilities:**
- Message storage
- Store ↔ thread sync effect
- Auto-create on /chat (moved to `useChat.sendMessage`)

---

## Phase 6 — Verification

### Automated tests (36 passing)

```
useConversationRuntime.test.ts  — 13 tests (updated for context)
useChatThreads.test.ts          — 16 tests (unchanged)
HomeScreen.test.tsx             — 7 tests (mocked useRecentChatThreads)
```

### Manual test checklist

| Scenario | Expected |
| --- | --- |
| Create thread | `useChat` creates thread before first message |
| Send message | Appears in cache; sidebar bumps on user send + stream end |
| Refresh | Server order preserved; messages reload from cache/API |
| Switch threads | `activeThreadId` changes; no reorder |
| Return + continue | Messages persist; no duplicates |
| Home recent chats | Shows same threads as sidebar (from cache) |
| CharacterBook extraction | Sees active chat messages when on chat thread |

---

## Files Changed

| File | Change |
| --- | --- |
| `contexts/ChatThreadContext.tsx` | **NEW** — canonical provider |
| `features/chat/hooks/useConversationStore.ts` | Adapter over context |
| `features/chat/hooks/useConversationRuntime.ts` | Orchestration only; sync removed |
| `features/chat/hooks/useChat.ts` | Thread create + touchActivity flags |
| `features/chat/components/ChatFirstInterface.tsx` | No runtime message injection |
| `components/HomeScreen.tsx` | `useRecentChatThreads` |
| `components/characters/CharacterBook.tsx` | `useActiveChatMessages` |
| `main.tsx` | Mount `ChatThreadProvider` |
| `test/utils.tsx` | Provider in test wrapper |
| Test files | Updated mocks |

---

## Stores / Paths Removed

### State paths removed
- Independent `useState<Message[]>` in `useConversationStore`
- `HomeScreen.recentThreads` local state
- Runtime sync effect (`messages` → `updateThread` bridge)
- Runtime auto-create effect (superseded by `useChat`)

### Fetch paths removed
- `HomeScreen`: `GET /api/conversation/threads?limit=3`

### Not removed (intentional)
- `useConversationStore` hook name — kept as adapter API for `useChat`
- `useChatThreads` hook — implementation unchanged, wrapped by provider
- Guest localStorage fallback — P3 backlog

---

## Remaining P2 Work

From [thread-consolidation-roadmap.md](./thread-consolidation-roadmap.md):

| # | Task | Priority |
| --- | --- | --- |
| 2.1 | Rename narrative `/api/threads` → `/api/narrative-threads` | P1 (deferred) |
| 2.2 | Stop client-authoritative `metadata.messages` writes | P2 |
| 2.3 | Move thread-health diagnostics under conversation threads | P2 |
| 2.4 | Merge `conversationService` into `threadContentService` | P2 |
| 2.5 | Remove guest localStorage thread cache | P3 |

---

## Success Criteria

| Metric | Status |
| --- | --- |
| One chat-thread cache | ✅ `ChatThreadProvider` |
| One message cache | ✅ `threads[].messages` via `activeMessages` |
| One ordering path | ✅ `updateThread({ touchActivity })` only |
| One hydration path | ✅ `hydrateThreadMessages` |
| No duplicate client state | ✅ HomeScreen + CharacterBook fixed |
| Runtime is orchestration-only | ✅ Sync effect removed |

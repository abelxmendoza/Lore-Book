# Thread Consolidation Roadmap

**Date:** 2026-06-16  
**Prerequisite:** [thread-system-inventory.md](./thread-system-inventory.md)  
**Mission:** One canonical chat thread architecture. Audit and merge — no new features first.

---

## Current State

Two thread systems coexist with **zero HTTP collisions** but **high conceptual collision**:

| | Chat | Narrative |
| --- | --- | --- |
| API | `/api/conversation/threads/*` | `/api/threads/*` |
| DB | `conversation_sessions` + `chat_messages` | `threads` |
| UX | ChatGPT sidebar | Timeline hierarchy |

**Chat durability sprint is done.** `chat_messages` is canonical; recovery service exists. Remaining work is **naming clarity**, **client cache dedup**, and **metadata snapshot deprecation**.

---

## Target Architecture

| Layer | Target |
| --- | --- |
| **Chat thread API** | `/api/conversation/threads/*` (eventual rename → `/api/threads` after narrative rename) |
| **Narrative API** | `/api/narrative-threads/*` (renamed from `/api/threads`) |
| **Message truth** | `chat_messages` only; `metadata.messages` derived |
| **Thread row** | `conversation_sessions` |
| **Intelligence** | `metadata.threadMeta` |
| **Search** | `GET .../threads/explore` + `threadExplorerService` |
| **Client cache** | `useChatThreads` (list) + `useConversationStore` (live messages) + `useConversationRuntime` (bridge) |
| **Ordering** | `updated_at` bumped only via `touchActivity: true` on new messages |

---

## Phase 3 — Route Consolidation Map

### Chat routes (`/api/conversation/threads/*`) — KEEP ALL

No deletions. This is the canonical chat surface. Optional future alias:

```
/api/threads/*  →  /api/conversation/threads/*   (after narrative rename only)
```

### Narrative routes (`/api/threads/*`) — RENAME, DO NOT MERGE

| Current | Target | Action |
| --- | --- | --- |
| `GET /api/threads` | `GET /api/narrative-threads` | RENAME + 301 alias (6 mo) |
| `GET /api/threads/:id/timeline` | `GET /api/narrative-threads/:id/timeline` | RENAME |
| All 16 narrative routes | Same under new prefix | RENAME |

**Why not merge into conversation?** Different tables, IDs, and UX. Merging would corrupt tenant data boundaries.

### Diagnostics — MERGE

| Current | Target |
| --- | --- |
| `GET/POST /api/diagnostics/thread-health` | `GET/POST /api/conversation/threads/health` |

---

## Phase 4 — Client State Consolidation

### Current (acceptable with fixes)

```
useConversationStore.messages     ← live display (no API)
useChatThreads.threads[].messages ← persisted snapshots
useConversationRuntime            ← syncs store ↔ threads, touchActivity
```

### Gaps to close

| Issue | Fix | Priority |
| --- | --- | --- |
| HomeScreen fetches `GET /threads?limit=3` independently | Use `useChatThreads` or shared `ThreadListProvider` | P1 |
| CharacterBook calls `useConversationStore()` in isolation | Pass `messages` from chat parent or read from shared context | P1 |
| Dual message copies in memory | Document contract; stop writing `metadata.messages` from client except debounced backup | P1 |
| No React Context for threads | Optional `ChatThreadProvider` wrapping sidebar + main | P2 |
| Guest mode localStorage cache | Keep until auth-only; document as non-canonical | P3 |

### Target client shape

```
ChatThreadProvider (P2)
  ├── useChatThreads()      → thread list, CRUD, hydrate
  ├── useConversationStore() → messages for active thread only
  └── useConversationRuntime() → URL + touchActivity + title
```

**One thread cache:** `useChatThreads.threads`  
**One message cache (live):** `useConversationStore.messages`  
**No third caches:** HomeScreen, CharacterBook must consume shared hooks.

---

## Phase 8 — Deletion Plan (nothing deleted in P0)

### DELETE (after alias period, P2–P3)

| Item | When | Prerequisite |
| --- | --- | --- |
| `/api/threads` mount (narrative) | P2 | All clients on `/api/narrative-threads` |
| Client writes to `metadata.messages` | P2 | Server rebuilds snapshot on every message persist |
| `conversationService` duplicate loaders | P2 | Callers migrated to `threadContentService` |
| `/api/diagnostics/thread-health` | P2 | Moved to conversation threads health |
| Guest localStorage thread cache | P3 | Guest mode removed or server-only |

### MERGE

| From | Into |
| --- | --- |
| `conversationService` message loaders | `threadContentService` |
| HomeScreen thread fetch | `useChatThreads` |
| `metadata.narrativeThemes` (client) | `threadMeta.themes` (document only) |
| Diagnostics thread-health | `/api/conversation/threads/health` |

### KEEP (no changes)

- All `threadContentService`, `threadIntelligenceService`, `threadSummaryService`, `threadRecoveryService`, `conversationTitleService`, `threadExplorerService`
- `useConversationStore`, `useChatThreads`, `useConversationRuntime`, `useChat`
- `conversation_sessions`, `chat_messages`, `metadata.threadMeta`
- All narrative `services/threads/*` (under renamed mount)

---

## Phase 9 — Ranked Roadmap

### P0 — Document & verify (this sprint) ✅

| # | Task | Status |
| --- | --- | --- |
| 0.1 | Thread system inventory doc | ✅ Done |
| 0.2 | Source-of-truth verification (`chat_messages` canonical) | ✅ Verified |
| 0.3 | Ordering audit (`touchActivity` contract) | ✅ Verified |
| 0.4 | Intelligence field audit (`threadMeta`) | ✅ Verified |
| 0.5 | Search canonical path documented | ✅ Done |
| 0.6 | This roadmap | ✅ Done |

**No code changes in P0** — audit only per sprint charter.

---

### P1 — Client cache dedup & naming clarity (1 sprint)

| # | Task | Effort | Risk |
| --- | --- | --- | --- |
| 1.1 | Fix CharacterBook isolated store — pass messages from chat or disable stale reads | S | Low |
| 1.2 | HomeScreen recent threads → consume `useChatThreads` slice | S | Low |
| 1.3 | Add `docs/thread-architecture.md` developer guide (1-page) | S | None |
| 1.4 | Rename narrative mount: `/api/threads` → `/api/narrative-threads` with backward alias | M | Medium — update 6 web files |
| 1.5 | Add route registry comment distinguishing chat vs narrative mounts | S | None |
| 1.6 | Stop client-authoritative `metadata.messages` — server writes snapshot after stream | M | Medium — test durability |

**Exit criteria:** No independent thread fetches outside `useChatThreads`; narrative API clearly named; zero user-visible ordering regressions.

---

### P2 — API surface cleanup (1 sprint)

| # | Task | Effort | Risk |
| --- | --- | --- | --- |
| 2.1 | Move thread-health diagnostics under `/api/conversation/threads/health` | S | Low |
| 2.2 | Merge `conversationService` message paths into `threadContentService` | M | Medium |
| 2.3 | Deprecate `metadata.messages` dual-write — rebuild from `chat_messages` on read if stale | M | Medium |
| 2.4 | Optional `ChatThreadProvider` React context | M | Low |
| 2.5 | Add integration test: message → touchActivity → list order → refresh stable | S | None |
| 2.6 | Remove narrative `/api/threads` alias after 1 release cycle | S | Low |

**Exit criteria:** Single message write path; health under conversation; no duplicate service loaders.

---

### P3 — Long-term simplification (backlog)

| # | Task | Notes |
| --- | --- | --- |
| 3.1 | Rename chat API `/api/conversation/threads` → `/api/threads` | Only after narrative rename shipped |
| 3.2 | Collapse `conversation_messages` into `chat_messages` for ingestion | Requires migration |
| 3.3 | Remove guest localStorage thread cache | Requires guest mode decision |
| 3.4 | Unified search: thread explore results in universal search index | Product decision |
| 3.5 | Episode/open-loop intelligence quality pass | Feature work, not consolidation |

---

## Success Metrics

| Metric | Before | Target |
| --- | --- | --- |
| Chat thread API mounts | 1 (`/api/conversation/threads`) | 1 (unchanged) |
| Ambiguous `/api/threads` callers | 6 web files (narrative) | 0 — all on `/api/narrative-threads` |
| Independent thread list fetches | 2 (useChatThreads + HomeScreen) | 1 |
| Message authority paths | 3 (chat_messages, conversation_messages, metadata.messages) | 1 write (`chat_messages`), 2 read-merge |
| Client thread caches | 3+ | 2 (list + live messages) |
| Thread ordering bugs on open | 0 (verified) | 0 |

---

## ChatGPT Parity Checklist

| Behavior | LoreBook | Status |
| --- | --- | --- |
| Sidebar ordered by last message activity | `updated_at` + `touchActivity` | ✅ |
| Opening thread doesn't bump order | `ensure-visible` no bump | ✅ |
| Refresh preserves order | Server sort by `updated_at` | ✅ |
| Thread title auto-generates | `conversationTitleService` | ✅ |
| Fork at message | `POST /threads/:id/fork` | ✅ |
| Search across threads | `/threads/explore` | ✅ |
| Delete thread | `DELETE /threads/:id` | ✅ |
| Durability / recovery | `threadRecoveryService` | ✅ |
| Single obvious thread API | Split naming (`conversation` vs `threads`) | ⚠️ P1 rename |

---

## Files Reference

| Area | Path |
| --- | --- |
| Chat routes | `apps/server/src/routes/conversationCentered.ts` |
| Narrative routes | `apps/server/src/routes/threads.ts` |
| Message loader | `apps/server/src/services/conversationCentered/threadContentService.ts` |
| Recovery | `apps/server/src/services/conversationCentered/threadRecoveryService.ts` |
| Search | `apps/server/src/services/conversationCentered/threadExplorerService.ts` |
| Intelligence | `apps/server/src/services/conversationCentered/threadIntelligenceService.ts` |
| Client threads | `apps/web/src/features/chat/hooks/useChatThreads.ts` |
| Client runtime | `apps/web/src/features/chat/hooks/useConversationRuntime.ts` |
| Client store | `apps/web/src/features/chat/hooks/useConversationStore.ts` |
| Durability tests | `apps/server/tests/services/threadDurability.test.ts` |

---

## Decision Log

| Decision | Rationale |
| --- | --- |
| Do not merge chat + narrative thread tables | Different domains, ID namespaces, product concepts |
| Keep `/api/conversation/threads` as chat canonical | Already wired to all chat UI; durability sprint invested here |
| Rename narrative to `/api/narrative-threads` | Eliminates #1 source of engineer confusion |
| Keep dual client stores (list + live) | Matches ChatGPT pattern: fast live UI + persisted list |
| Defer `/api/threads` chat rename to P3 | Requires narrative rename first to avoid collision |

---

## Next Action

Execute **P1.1 + P1.2** (client cache dedup) when implementation sprint begins. P0 audit artifacts are complete.

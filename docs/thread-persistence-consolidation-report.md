# Thread Persistence Consolidation Report (P2)

**Date:** 2026-06-16  
**Prerequisite:** [thread-cache-consolidation-report.md](./thread-cache-consolidation-report.md)  
**Mission:** `chat_messages` is the only message authority. No dual-write.

---

## Executive Summary

P2 removed the client ↔ server `metadata.messages` dual-write loop. Messages now persist exclusively through `omegaChatService` → `chat_messages`. Hydration reads `chat_messages` first; legacy snapshots are read-only fallbacks when the canonical table is empty.

---

## Phase 1 — Message Write Audit

| Writer | Path | Purpose | P2 Verdict |
| --- | --- | --- | --- |
| **omegaChatService** | `INSERT chat_messages` | User + assistant turns from `/api/chat/stream` | **KEEP** — canonical |
| **useChatThreads (client)** | `PATCH metadata.messages` (debounced) | Client snapshot sync | **REMOVED** |
| **useChatThreads (client)** | `beforeunload` keepalive PATCH | Flush pending snapshot | **REMOVED** |
| **PATCH /threads/:id** | `metadata.messages = body.messages` | Accept client snapshot | **DEPRECATED** — ignored |
| **threadRecoveryService** | Rebuild `metadata.messages` from chat | Repair drift | **REMOVED** — ordering/title only |
| **recoverOrphanSession** | Insert with `metadata.messages` | Orphan recovery | **REMOVED** snapshot write |
| **POST /threads** | `metadata: { messages: [] }` | Empty thread init | **REMOVED** — `metadata: {}` |
| **ingestionPipeline** | `conversation_messages` | Pipeline ingestion path | **KEEP** — separate ingestion store |
| **conversationService** | Read `metadata.messages` fallback | Legacy loader | **KEEP read-only** (fallback) |

---

## Phase 2 — Hydration Audit

### Canonical path (all flows)

```
GET /api/conversation/threads/:id/messages
  → loadThreadMessages()
      1. chat_messages (if any → return immediately)
      2. else merge conversation_messages + metadata.messages (legacy)
```

### Callers

| Flow | Hydration path | Fallback |
| --- | --- | --- |
| URL open (`useConversationRuntime`) | `hydrateThreadMessages` → GET messages | Local cache if API fails |
| Sidebar select | Same | Same |
| Boot thread list | GET `/threads` — **titles only**, messages empty | Hydrate on open |
| Thread explorer | `threadExplorerService` — metadata then chat merge | Legacy |
| Recovery | `recoverOrphanSession` — uses `loadThreadMessages` | chat_messages |

### Fallbacks removed

- Sidebar list no longer pre-populates from `metadata.messages` (`dbRowToThread` → `messages: []`)
- Client no longer treats local snapshot as co-authoritative with server on authenticated paths

### Fallbacks retained (legacy read-only)

- `loadThreadMessages` falls back to `conversation_messages` + `metadata.messages` when `chat_messages` is empty (pre-migration threads)

---

## Phase 3 — Canonical Message Store

| Layer | Role | Authority |
| --- | --- | --- |
| **chat_messages** | Live turns from chat stream | ✅ **Write + read canonical** |
| **conversation_messages** | Ingestion pipeline | Read fallback only |
| **metadata.messages** | Legacy client snapshot | **Deprecated** — read fallback only |
| **Client cache** | `threads[].messages` in memory | Ephemeral UI cache |

---

## Phase 4 — Snapshot Deprecation Matrix

| Item | Verdict |
| --- | --- |
| `metadata.messages` client PATCH | **DELETE** (P2) |
| `metadata.messages` server PATCH accept | **DEPRECATE** — ignored, schema kept for compat |
| `metadata.messages` read in `loadThreadMessages` | **KEEP** — legacy fallback until P3 migration |
| `metadata.messages` in thread list GET | **DELETE** from client parse |
| Recovery snapshot rebuild | **DELETE** (P2) |
| Guest localStorage messages | **KEEP** — offline guest mode (P3 removal) |

---

## Phase 5 — Recovery Safety

| Scenario | Mechanism | Status |
| --- | --- | --- |
| Refresh | GET messages → `chat_messages` | ✅ |
| Reconnect | Same hydration path | ✅ |
| Partial stream | Assistant row persisted in `chat_messages` (omegaChatService) | ✅ Unchanged |
| Missing assistant | `countMissingAssistantTurns` health check | ✅ Unchanged |
| Broken thread | `recoverOrphanSession` from `chat_messages` | ✅ No snapshot needed |
| Ordering repair | `repairThread` bumps `updated_at` from last chat_message | ✅ |
| Title repair | `deriveTitleFromMessages` from chat_messages | ✅ |

---

## Phase 6 — Testing

### Server (18 passing)

- `threadContentService.test.ts` — chat-first load, legacy fallback
- `threadDurability.test.ts` — dedupe, ordering, missing assistant

### Client (30 passing)

- `useChatThreads.test.ts` — touchActivity-only PATCH, flushSave no-op
- `useConversationRuntime.test.ts` — orchestration unchanged

---

## Files Changed

| File | Change |
| --- | --- |
| `threadContentService.ts` | Chat-first loader; orphan recovery without snapshot |
| `threadRecoveryService.ts` | No snapshot rebuild; deprecated drift metrics |
| `conversationCentered.ts` | PATCH ignores messages; POST empty metadata |
| `useChatThreads.ts` | Removed debounce/keepalive; touchActivity-only PATCH |
| `conversationMetadata.ts` | Deprecated messages field docs |
| Tests | Updated for new contracts |

---

## Writers Removed

1. Client debounced `PATCH { messages }` (every 1.5s during chat)
2. Client `beforeunload` keepalive message flush
3. Server `PATCH` metadata.messages merge
4. Recovery `metadata.messages` rebuild
5. Orphan insert `metadata.messages` population
6. Thread list client parse from `metadata.messages`

---

## Snapshots Removed

- Active dual-write to `metadata.messages` (client + server accept path)
- Recovery-driven snapshot regeneration
- New thread `metadata.messages: []` initialization

**Still present (read-only legacy):** existing rows in DB; `loadThreadMessages` fallback when `chat_messages` empty.

---

## Fallbacks Removed

- Sidebar hydration from metadata snapshot on list load
- Sync-bridge implication that client snapshot is durable authority

---

## Remaining P3 Work

| # | Task | Priority |
| --- | --- | --- |
| 3.1 | Backfill migration: copy legacy `metadata.messages` → `chat_messages` where missing | P3 |
| 3.2 | Remove `metadata.messages` read fallback from `loadThreadMessages` | P3 |
| 3.3 | Strip `messages` from PATCH schema entirely | P3 |
| 3.4 | Remove guest localStorage message cache | P3 |
| 3.5 | Collapse `conversation_messages` into ingestion-only (no read merge) | P3 |
| 3.6 | Rename narrative `/api/threads` mount | P1 deferred |

---

## Success Criteria

| Metric | Status |
| --- | --- |
| One message authority (`chat_messages`) | ✅ |
| No client dual-write | ✅ |
| No server snapshot accept | ✅ |
| Hydration unambiguous (chat-first) | ✅ |
| Recovery works without snapshots | ✅ |
| Legacy threads still load (fallback) | ✅ |

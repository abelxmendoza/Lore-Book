# Chat Durability Report

**Date:** 2026-06-17  
**Sprint:** Chat Memory Utilization  
**Prior audit:** [`docs/chat-durability-audit.md`](chat-durability-audit.md) (2026-06-16)

---

## Executive Summary

Message disappearance is **real but mostly historical**. The durable assistant write path (`persistAssistant` in `chat.ts`) is live and working. Remaining gaps are **conditional user saves**, **trivial-message skips**, **client-side races**, and **legacy read fallbacks** — not a missing persistence layer.

| Scenario | Persists today? | Risk |
|----------|-----------------|------|
| User message (normal chat) | ✅ Usually | Fails silently on DB error |
| Assistant message (stream) | ✅ Via `persistAssistant` | Empty response skipped |
| Refresh reload | ✅ From `chat_messages` | Legacy fallback if empty |
| Thread switch | ✅ Client cache | No server flush needed |
| Mode/recall early return | ⚠️ User often **not** saved | Orphan assistant possible |
| Trivial messages ("hi", "ok") | ❌ Skipped | Vanish on refresh |

---

## Phase 1 — Persistence Paths

### User messages

```
POST /api/chat/stream
  → omegaChatService.chatStream()
  → chat_messages INSERT (role: user)
  → conversation_sessions.updated_at bump
```

**Gates that block user save:**
- `isTrivialMessage(message)` — short acknowledgments skipped
- Mode router early return (except EXPERIENCE_INGESTION / ACTION_LOG)
- Recall / foundation / diagnostic short-circuits before main path
- DB insert failure — logged, stream continues

### Assistant messages

```
chat.ts persistAssistant() — awaited once per stream
  → chat_messages INSERT (metadata.saved_from_stream, stream_status)
  → conversation_sessions.updated_at bump
```

**Also writes (race risk):** fire-and-forget assistant inserts at omegaChatService L651/867/944 on recall branches — can duplicate or fail silently.

### Refresh persistence

```
GET /api/conversation/threads/:id/messages
  → threadContentService.loadThreadMessages()
  → chat_messages (canonical)
  → fallback: conversation_messages + metadata.messages (legacy)
```

### Thread switch

- Client: `ChatThreadProvider` holds per-thread `messages[]`
- `flushSave` is a **no-op** (P2 consolidation) — relies on server saves during send
- Refresh rehydrates from API; synthetic client IDs (`user-${Date.now()}`) replaced by server UUIDs

---

## Failure Paths (Complete Inventory)

### Server — messages never written

| # | Failure | Impact |
|---|---------|--------|
| F1 | Trivial message gate | User turn lost on refresh |
| F2 | Mode/recall early return before L1556 | User not saved; assistant may persist |
| F3 | User insert error (warn only) | Stream succeeds; user gone on refresh |
| F4 | `persistAssistant` skipped (no auth, no sessionId, empty response) | Assistant lost |
| F5 | No `threadId` → `chat_sessions` fallback UUID | Messages invisible in thread list |
| F6 | `chatStream()` throws before return | Neither message saved |
| F7 | Non-stream `chat()` assistant fire-and-forget | Assistant may not land |

### Server — duplicate / corrupt history

| # | Failure | Impact |
|---|---------|--------|
| F8 | Fire-and-forget + `persistAssistant` | Duplicate assistant rows |
| F9 | Orphan assistant (reply without user) | Confusing thread balance |

### Client — appears to disappear

| # | Failure | Impact |
|---|---------|--------|
| F10 | Optimistic UI; server never saved | Gone on refresh |
| F11 | `removeEmptyThread` on hydrate=0 | Thread deleted if save lags |
| F12 | Hydrate error → empty delete path | Thread removed incorrectly |
| F13 | Backend down → guest localStorage | In-memory messages lost |
| F14 | Legacy fallback reads stale snapshot | Partial/wrong history |
| F15 | Thread switch mid-stream | Message attaches to wrong thread |

### Historical data (founder account)

From prior audit — pre-2026-06-16 assistant persistence fix:

- Session `6927adf5`: 71 user / 3 assistant (68 missing replies)
- Total founder imbalance: 95 user / 7 assistant across sampled sessions

New messages after the fix should show balanced turns via `metadata.saved_from_stream`.

---

## Verification Checklist

```bash
# Thread durability helpers
npm test -- threadDurability threadContentService

# Live thread message load
curl -H "Authorization: Bearer $TOKEN" \
  "$API/api/conversation/threads/$THREAD_ID/messages"
```

| Test | Pass criteria |
|------|---------------|
| Send + refresh | User and assistant both present |
| Thread switch + return | Messages preserved in cache |
| Hard refresh | Server UUIDs, full history |
| Stream disconnect mid-response | `stream_status: partial` assistant saved |
| Trivial "thanks" | Known gap — may not persist |

---

## Recommendations

| Priority | Fix | Addresses |
|----------|-----|-----------|
| P0 | Save user message **before** any early-return branch | F2, F9 |
| P1 | Remove trivial-message skip or persist with `trivial: true` flag | F1 |
| P1 | Delete `removeEmptyThread` race — retry hydrate before delete | F11, F12 |
| P2 | Remove legacy read fallback once all threads have `chat_messages` | F14 |
| P2 | Consolidate assistant writes — single `persistAssistant` path only | F8 |

---

## Key files

| Concern | Path |
|---------|------|
| Durable assistant | `apps/server/src/routes/chat.ts` |
| User/assistant orchestration | `apps/server/src/services/omegaChatService.ts` |
| Message loader | `apps/server/src/services/conversationCentered/threadContentService.ts` |
| Client hydration | `apps/web/src/features/chat/hooks/useConversationRuntime.ts` |
| Optimistic send | `apps/web/src/features/chat/hooks/useChat.ts` |

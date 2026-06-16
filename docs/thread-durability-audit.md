# Thread Durability Audit — ChatGPT-Grade Conversation System

**Mission:** a conversation should never appear lost, a response should never disappear, a thread should never reorder wrong. *"If I ever said it, LoreBook can always find it."*

Grounded in the code as of this sprint. Two **P0 data-loss root causes** found; full lifecycle, guarantees, and execution plan below.

---

## Task 1 — Conversation lifecycle (traced)

| Step | What happens | Writes | Risk found |
|---|---|---|---|
| **Create thread** | `conversation_sessions` row created, `updated_at = now`, `metadata.messages = []` ([conversationCentered.ts:383](apps/server/src/routes/conversationCentered.ts#L383)) | `conversation_sessions` | ok |
| **Create user message** | persisted inside `chatStream` **before** generation, but **only if `!isTrivialMessage`** ([omegaChatService.ts:1531](apps/server/src/services/omegaChatService.ts#L1531)) → `chat_messages(role='user')` | `chat_messages` | ⚠️ trivial msgs not saved; lost if `chatStream` throws before this point |
| **Stream assistant** | route accumulates `fullResponse` chunk-by-chunk ([chat.ts:175](apps/server/src/routes/chat.ts#L175)); nothing persisted yet | — | ⚠️ nothing durable during the stream |
| **Persist assistant** | **route-only, post-stream, fire-and-forget**, gated on `metadata.sessionId` ([chat.ts:188](apps/server/src/routes/chat.ts#L188)) | `chat_messages(role='assistant')` | 🔴 **P0**: skipped on mid-stream throw; lost if `sessionId` missing; partial content not saved on the error path; **does not bump `updated_at`** |
| **Update thread metadata** | not updated on assistant completion | — | 🔴 ordering can't reflect the assistant turn |
| **Refresh sidebar** | thread list `ORDER BY updated_at DESC` ([:143](apps/server/src/routes/conversationCentered.ts#L143)) + a redundant JS re-sort ([:164](apps/server/src/routes/conversationCentered.ts#L164)) | — | ⚠️ double sort; updated_at not bumped by assistant ⇒ stale order |
| **Reload page** | sidebar hydrates from `conversation_sessions`; thread opens via `/threads/:id/messages` → `loadThreadMessages` | reads | see below |
| **Reopen thread** | `loadThreadMessages` **merges 3 sources**: `conversation_messages` (async ingestion) + `chat_messages` (canonical) + `metadata.messages` (snapshot) ([threadContentService.ts:56](apps/server/src/services/conversationCentered/threadContentService.ts#L56)) | reads | 🔴 **P0**: if the assistant was never written to *any* source (see above), the thread renders **user-only** |

### The two P0 root causes

**P0-A — Assistant messages are not durably persisted.**
The only write of the streamed assistant message is a **fire-and-forget insert in the route, after the stream ends** ([chat.ts:188–212](apps/server/src/routes/chat.ts#L188)). It is:
- **skipped entirely** when the stream loop throws (OpenAI mid-stream error → the `catch` path, no insert);
- **gated on `result.metadata.sessionId`** — missing sessionId ⇒ no row;
- **not saved as partial** on failure (only the final `fullResponse` on the success path);
- **does not bump `conversation_sessions.updated_at`** ⇒ the thread doesn't rise to the top after the assistant replies.
Result: the exact symptoms — *missing assistant messages, user-only threads, partial conversations*.

**P0-B — Hydration has three competing sources, none authoritative.**
`loadThreadMessages` merges `conversation_messages` (populated **asynchronously** by the ingestion pipeline), `chat_messages` (the canonical chat log), and a `metadata.messages` snapshot. The merge itself is sound (dedup by `role:content`, prefers real DB ids — [threadContentService.ts:34](apps/server/src/services/conversationCentered/threadContentService.ts#L34)) and **cannot drop a message that exists**. But because no single source is authoritative and the canonical one (`chat_messages`) is missing the assistant row (P0-A), hydration shows partial conversations. The fix is to make **`chat_messages` the canonical source** and guarantee both turns are written to it.

---

## Task 3 — Deterministic ordering (design)

- **Rule:** `conversation_sessions.updated_at` is bumped to the **message timestamp** on *every* persisted message — user send **and** assistant completion. Sort `ORDER BY updated_at DESC`. (Today the assistant write doesn't bump it → P0-A includes this.)
- Remove the redundant client/JS re-sort ([:164](apps/server/src/routes/conversationCentered.ts#L164)); a single SQL `ORDER BY updated_at DESC` is the only ordering authority.
- **No optimistic reordering without reconciliation:** the client may hoist a thread on send, but must reconcile against the server's `updated_at` on the next list fetch (server wins).

## Task 4 — ChatGPT-style sidebar (design)

- **Top = most-recently-active** via `updated_at DESC`. Opening a thread does **not** bump `updated_at` (only new activity does) → opening never corrupts order. (This is already the case server-side; ensure the client doesn't optimistically reorder on open.)
- **Scale to thousands:** keyset pagination on `(updated_at, id)` — `WHERE (updated_at, id) < (:cursor_ts, :cursor_id) ORDER BY updated_at DESC, id DESC LIMIT 30`. Stable under inserts, O(page) not O(all). (Today the list loads all sessions then JS-sorts — replace with keyset + virtualization.)
- **Virtualization:** render only visible rows (`@tanstack/react-virtual`), fetch next page on scroll. Thread row = `{id, title, subtitle, updated_at, messageCount}` (cheap; no message bodies).

## Task 5 — Message durability guarantees (target)

| Scenario | Guarantee | How |
|---|---|---|
| User sends | **user message persists before generation begins** | synchronous `chat_messages` insert (incl. trivial) before the OpenAI call |
| Stream crashes mid-way | **partial assistant survives** | placeholder assistant row at stream start; updated with accumulated content in a `finally` covering done/disconnect/error |
| OpenAI fails | **user message survives** | already persisted pre-generation; assistant row marked `status='failed'` |
| Browser refresh | **conversation survives** | both turns in `chat_messages`; hydrate from it |
| Tab close | **conversation survives** | server-side persistence is independent of the client |

## Task 8 — Stream safety (design; frontend)

Risks today: switching threads during generation can let a stream write into the wrong thread (`setMessages` keyed only on a client id). Design:
- **`AbortController` per send**; abort on thread switch/unmount.
- **Stream ownership token**: each stream carries `{threadId, streamId}`; chunk handlers drop any chunk whose `threadId !== activeThreadId` (sequence guard) — *"no response may write to a thread that is no longer active."*
- **Thread versioning**: a monotonically increasing `activeThreadVersion`; late chunks from a superseded version are ignored (ghost-response guard).

## Task 9 — Conversation references (design)

A `conversation_index` projection (or a cheap view over `conversation_sessions` + counts): `{threadId, title, summary, messageCount, firstActivity, lastActivity, archived}`, always queryable so no conversation feels gone — even archived/months old. Backed by `chat_messages` counts; refreshed on write. (Partially exists via thread metadata; formalize as the durable index.)

---

## Task 12 — Execution plan (ranked by Trust Impact × Data-Loss Risk ÷ Cost)

| P | Item | Why | Cost |
|---|---|---|---|
| **P0** | **Durable assistant persistence** (placeholder + `finally` update covering done/disconnect/error; drop sessionId gate; bump `updated_at`) | Stops missing-assistant / user-only threads — the #1 trust bug | M |
| **P0** | **Hydrate from `chat_messages` as canonical** (keep merge as recovery fallback) | Stops partial conversations | S |
| **P0** | **`threadRecoveryService` + `/api/diagnostics/thread-health`** | Detect + auto-repair existing orphans/drift; measure | M |
| **P0** | **Persist user message incl. trivial, before generation** | No lost user turns | S |
| **P1** | **Stream ownership/AbortController/versioning** (frontend) | Stops ghost responses on thread switch | M |
| **P1** | **Single source of truth on the client** (collapse `useConversationStore` + `useChatThreads` active-thread duplication) | Stops client-side drift/reorder | M |
| **P1** | **Keyset pagination + virtualization** | Scale to thousands of threads | M |
| **P2** | **`conversation_index` projection + summaries** | Always-referenceable archive | M |
| **P2** | **Collapse the 3 message representations** → `chat_messages` canonical, `conversation_messages` as an ingestion projection only | Removes drift at the source | L |
| **P3** | Multi-tab sync (BroadcastChannel), offline queue | Polish | L |

**This sprint implements the P0 set** (see the new `threadRecoveryService.ts`, the `/api/diagnostics/thread-health` endpoint, the durable-assistant route fix, and `threadDurability.test.ts`). P1–P3 are designed above for the next sprints.

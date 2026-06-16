# State Management Audit — Conversation/Thread/Message State

**Goal:** one authoritative source of truth, not multiple competing stores. (Companion to `thread-durability-audit.md`.)

**Finding:** there is **no global store** (no Zustand/Redux). Conversation state is spread across React `useState` hooks, and **the active conversation's messages live in two places** (`useConversationStore` and the open thread inside `useChatThreads`) — the client-side duplication behind reorder/disappear glitches.

---

## Inventory

| Store / hook | Purpose | Source of truth? | Consumers | Duplication risk |
|---|---|---|---|---|
| **`useConversationStore`** ([useConversationStore.ts](apps/web/src/features/chat/hooks/useConversationStore.ts)) | the **active** thread's `Message[]` (`messages`, `addMessage`, `updateMessage`, `setMessages`, `clear`) | **client-local** mirror of `chat_messages` | `useChat`, `ChatFirstInterface` | 🔴 same messages also held per-thread in `useChatThreads` |
| **`useChat`** ([useChat.ts](apps/web/src/features/chat/hooks/useChat.ts)) | orchestration: send, stream consume, optimistic add, error mapping | none (controller) | `ChatFirstInterface` | streams into `useConversationStore`; user-msg id is synthetic `user-…` (not the DB id) |
| **`useChatThreads`** ([useChatThreads.ts](apps/web/src/features/chat/hooks/useChatThreads.ts)) | thread **list** + per-thread `messages` (hydrates via `/threads/:id/messages`, `dbMessageToMessage`) | **client mirror** of `conversation_sessions` + hydrated messages | sidebar, thread open | 🔴 holds `messages` per thread *and* `useConversationStore` holds active messages → two arrays for the same thread |
| **`useConversationRuntime`** | thread lifecycle/subtitle/runtime metadata | client | chat UI | low |
| **`useChatComposer`** | composer input/entity chips | client | composer | low |
| **`useChatSearch`** / **`useThreadExplorer`** | read-only search/explore | server | search UI | none |
| **`useMessageCorrection`** | correction API calls | server | message actions | none |
| **Server tables** | `chat_messages` (canonical), `conversation_sessions` (threads), `conversation_messages` (ingestion projection), `conversation_sessions.metadata.messages` (legacy snapshot) | **`chat_messages` should be canonical** | hydration, ingestion | 🔴 3 server message representations (see durability audit P0-B/P2) |

---

## The duplication problem (and the fix)

**Two client arrays for the same messages:** `useConversationStore.messages` (active thread) and `useChatThreads`'s per-thread `messages`. On send/stream they can diverge (one updates, the other doesn't), producing "the message I just sent vanished when I switched back" and reorder glitches.

**Recommended single source of truth (client):**
```
Server: chat_messages  ← canonical, immutable log
   │  (hydrate)
   ▼
Client: one normalized message cache keyed by threadId  (Map<threadId, Message[]>)
   │
   ├─ active thread = a selector over the cache (NOT a second array)
   └─ sidebar = thread metadata only (no message bodies)
```
- Replace the two arrays with **one** `threadId → Message[]` cache (a small store or a single hook), and make the "active conversation" a *derived view* of `cache[activeThreadId]` — never a separate copy.
- The sidebar holds only `{id, title, subtitle, updated_at, messageCount}` — no message bodies — so it can't drift from message state.
- All optimistic updates write to the one cache; server hydration **reconciles** into it (server `chat_messages` wins on conflict).

**Server source of truth:** make `chat_messages` canonical; treat `conversation_messages` as an ingestion projection and `metadata.messages` as deprecated (durability audit P2). Hydration reads `chat_messages` first; the 3-source merge stays only as a **recovery** fallback.

---

## Consumers map (who reads what today)

- **Sidebar** ← `useChatThreads.threads` ← `GET /api/conversation/threads`.
- **Open conversation** ← `useConversationStore.messages` (live) **and** `useChatThreads` per-thread `messages` (hydrated) — the duplication.
- **Send/stream** ← `useChat` → writes `useConversationStore` + server `chat_messages`.
- **Correction** ← `useMessageCorrection` → `PATCH /api/chat/messages/:id`.

## Recommendation (P1)

1. Introduce **one** message cache keyed by `threadId` (the only client message store).
2. Make active-conversation and per-thread views **selectors** over it (delete the second array).
3. Sidebar = metadata-only.
4. Server: `chat_messages` canonical; reconcile client cache against it on hydrate; server wins.

This collapses N competing stores into **one authoritative client cache mirroring one authoritative server table** — the prerequisite for the stream-safety and ordering guarantees in the durability audit.

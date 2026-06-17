# P0 Stability Audit

Scope: production trust failures in chat/thread durability, OpenAI failure handling, and memory state. This is not a vision document.

## Thread Lifecycle Code Path

Create/open path:

1. `apps/web/src/features/chat/hooks/useConversationRuntime.ts`
   - `createThread()` from `useChatThreads`
   - `POST /api/conversation/threads`
   - `navigate(/chat/:id)`
2. `apps/web/src/features/chat/hooks/useChat.ts`
   - optimistic user `addMessage`
   - optimistic assistant placeholder `addMessage`
   - `streamChat(..., activeThreadId)`
3. `apps/web/src/hooks/useChatStream.ts`
   - `POST /api/chat/stream`
   - reads SSE `metadata`, `chunk`, `done`, `error`
4. `apps/server/src/routes/chat.ts`
   - validates request
   - calls `omegaChatService.chatStream`
   - streams response chunks
5. `apps/server/src/services/omegaChatService.ts`
   - builds RAG/system prompt
   - creates OpenAI stream
   - saves user message to `chat_messages`
   - enqueues ingestion
6. `apps/web/src/features/chat/hooks/useConversationRuntime.ts`
   - syncs `messages` to current thread via `updateThread`
7. `apps/web/src/features/chat/hooks/useChatThreads.ts`
   - debounced `PATCH /api/conversation/threads/:id`
   - stores `metadata.messages` on `conversation_sessions`
8. Reload/open old thread:
   - `GET /api/conversation/threads`
   - `GET /api/conversation/threads/:id/messages`
   - `threadContentService.loadThreadMessages`
   - `setMessages`

## Issues

### 1. Thread Persistence Failures

Severity: Critical

Root cause:

- Streaming assistant replies were not durably inserted into `chat_messages`.
- Server-side thread history relied on client `PATCH` of `conversation_sessions.metadata.messages`.
- If debounce, refresh, thread switch, failed PATCH, or stale metadata occurred, the durable server copy could contain only user messages.

Affected files:

- `apps/server/src/routes/chat.ts`
- `apps/server/src/services/omegaChatService.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`
- `apps/web/src/features/chat/hooks/useConversationRuntime.ts`

Fix recommendation:

- Fixed: `routes/chat.ts` now inserts completed streamed assistant replies into `chat_messages`.
- Remaining: persist user + assistant messages under one server-owned transcript ID before reporting a thread as cloud-backed.

### 2. State Management Failures

Severity: Critical

Root cause:

- Three stores can act as authorities: `useConversationStore`, `conversation_sessions.metadata.messages`, and `chat_messages`.
- The client can update thread state while the URL still points at an older thread.
- Existing guards (`intendedThreadRef`, `hydratedByHandlerRef`, `isHydratedRef`) reduce the race but do not remove split authority.

Affected files:

- `apps/web/src/features/chat/hooks/useConversationStore.ts`
- `apps/web/src/features/chat/hooks/useConversationRuntime.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`

Fix recommendation:

- Keep `useConversationStore` as optimistic display only.
- Treat `chat_messages` as the durable source.
- Flush or cancel in-flight stream and pending saves on thread switch.

### 3. Hydration Failures

Severity: Critical

Root cause:

- `threadContentService.loadThreadMessages` previously returned `metadata.messages` immediately when present.
- A partial metadata snapshot with only user messages masked fuller `chat_messages` rows.

Affected files:

- `apps/server/src/services/conversationCentered/threadContentService.ts`
- `apps/server/src/routes/conversationCentered.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`

Fix recommendation:

- Fixed: `loadThreadMessages` now merges `conversation_sessions.metadata.messages`, `conversation_messages`, and `chat_messages`, dedupes by role/content, and sorts chronologically.
- Keep `recover-orphans` and `ensure-visible`, but do not depend on them as primary durability.

### 4. Message Ordering Failures

Severity: High

Root cause:

- Client message IDs and server UUIDs differ.
- Metadata timestamps come from the browser; DB timestamps come from Supabase.
- Same user text can exist once in metadata and once in `chat_messages`.

Affected files:

- `apps/web/src/features/chat/hooks/useChat.ts`
- `apps/web/src/hooks/useChatStream.ts`
- `apps/server/src/services/conversationCentered/threadContentService.ts`

Fix recommendation:

- Fixed: merged loader uses server rows over synthetic client IDs for duplicate role/content rows.
- Remaining: send server `userMessageId` and `assistantMessageId` in SSE metadata and replace optimistic IDs.

### 5. Streaming Failures

Severity: High

Root cause:

- If SSE ends without `done`, `useChatStream` may exit without `onComplete`.
- If a stream errors mid-response, UI may show a partial assistant reply or generic failure text.
- Before this sprint, successful streamed replies were not server-persisted as assistant rows.

Affected files:

- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/features/chat/hooks/useChat.ts`
- `apps/server/src/routes/chat.ts`

Fix recommendation:

- Fixed: completed streamed replies are now inserted into `chat_messages`.
- Fixed: quota errors now return stage-specific text.
- Remaining: treat reader end without `done` as an error unless full completion was confirmed.

### 6. Race Conditions

Severity: Critical

Root cause:

- User can switch threads while stream chunks are still arriving.
- First send from `/chat` can start before URL `threadId` is established, causing the backend to fall back to a different session.
- Debounced save can target a stale or newly intended thread.

Affected files:

- `apps/web/src/features/chat/hooks/useChat.ts`
- `apps/web/src/features/chat/hooks/useConversationRuntime.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`
- `apps/server/src/services/chat/chatPersistenceService.ts`

Fix recommendation:

- Block `streamChat` until the thread exists and the server create call has succeeded.
- Abort stream on thread switch/new chat/unmount.
- Attach a request sequence ID to every stream callback and ignore stale callbacks.

### 7. Duplicate Writes

Severity: High

Root cause:

- Same logical message can be stored in `metadata.messages` and `chat_messages`.
- Ingestion can save user rows while client persistence saves local copies.
- Dedupe is content-based only at some layers and ID-based at others.

Affected files:

- `apps/server/src/services/omegaChatService.ts`
- `apps/server/src/services/conversationCentered/threadContentService.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`

Fix recommendation:

- Fixed: hydration dedupes duplicate role/content rows and prefers durable server IDs.
- Remaining: add explicit `client_message_id` / `server_message_id` mapping to avoid content-only dedupe.

### 8. Missing Assistant Messages

Severity: Critical

Root cause:

- The non-streaming `chat()` path saved assistant messages; the streaming `chatStream()` path did not.
- Metadata-first hydration made the problem visible as old threads containing only user messages.

Affected files:

- `apps/server/src/routes/chat.ts`
- `apps/server/src/services/omegaChatService.ts`
- `apps/server/src/services/conversationCentered/threadContentService.ts`

Fix recommendation:

- Fixed: streamed assistant messages are persisted in `chat_messages`.
- Fixed: hydration no longer lets user-only metadata hide assistant rows in `chat_messages`.

## OpenAI Failure Handling

### Code Path

Response generation:

1. `useChat.ts`
2. `useChatStream.ts`
3. `routes/chat.ts`
4. `omegaChatService.chatStream`
5. `createOpenAIChatStream`
6. `lib/openai.ts`

Memory ingestion:

1. `omegaChatService.chatStream`
2. `chat_messages` user insert
3. `ingestionQueue.enqueue`
4. `ingestionPipelineClass.ingestFromChatMessage`
5. detectors/entity creation/fact extraction

### 429 `insufficient_quota`

Severity: High

Root cause:

- UI mapped quota/rate-limit text to "The AI is temporarily over capacity."
- That message hides the actual failure and does not distinguish response generation from ingestion.

Affected files:

- `apps/server/src/routes/chat.ts`
- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/features/chat/hooks/useChat.ts`
- `apps/server/src/lib/openai.ts`
- `apps/server/src/services/chat/openaiChatStreamAdapter.ts`

Fix recommendation:

- Fixed: setup-time 429 now returns `stage: response_generation` and explicit memory state.
- Fixed: UI now uses server `userMessage` for 429 instead of "over capacity."
- Fixed: `openai.responses.create` and legacy importance OpenAI calls now go through the shared concurrency gate.
- Remaining: expose ingestion failures through `pipeline_runs` or message delivery status.

What saves/fails:

- If `chatStream()` fails before returning a stream: server-side user message save and ingestion have not run.
- If streaming fails after user save: user row may exist; assistant row is incomplete/missing; ingestion may already be queued.
- If ingestion fails after a successful reply: user sees a normal reply, but memories/entities/facts may be missing unless pipeline status is surfaced.

## Ranked Execution Plan

### P0

- Persist streamed assistant messages server-side. Status: fixed.
- Merge all thread message stores on hydration; do not trust metadata first. Status: fixed.
- Replace misleading OpenAI quota UX with stage-specific failure text. Status: fixed.
- Block streaming until thread creation is acknowledged and `threadId` is stable. Status: remaining.
- Abort/sequence-guard active streams on thread switch and new chat. Status: remaining.

### P1

- Add message delivery status: `optimistic`, `server_saved`, `assistant_saved`, `ingestion_pending`, `ingestion_failed`.
- Persist server message IDs back to client messages.
- Treat SSE reader close without `done` as an error.
- Add unmount flush for pending thread saves, not only `beforeunload`.

### P2

- Consolidate `conversation_sessions.metadata.messages` into a cache, not authority.
- Add repair job for threads where metadata and `chat_messages` disagree.
- Add tests for thread switch during active stream.

### P3

- Remove legacy `chat_sessions` fallback once migration proves all active UI threads use `conversation_sessions`.
- Add admin diagnostics for split-brain threads and orphaned message rows.

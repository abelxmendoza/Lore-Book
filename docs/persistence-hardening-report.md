# Persistence Hardening Report

**Sprint:** Chat Trust Recovery — Phase 2  
**Date:** 2026-06-16

## Goal

Ensure messages never disappear: user turns saved before any routing branch; assistant turns awaited with visible errors on failure.

## Before

| Path | User persist | Assistant persist |
|------|--------------|-------------------|
| Stream (`/api/chat/stream`) | Late insert after routing in some branches | Fire-and-forget in recall/mode/memory paths + `persistAssistant` in route |
| Non-stream (`chat()`) | Inline save | Fire-and-forget `.then()` with debug-level failure log |

Failure modes:

- User message lost if early return (recall, mode handler) happened before save.
- Assistant message lost if stream completed but fire-and-forget insert failed.
- `persistAssistant` failures only logged as warnings.

## After

### User messages — early persist

`omegaChatService.persistUserMessageEarly()`:

- Runs at the start of `chatStream()` before routing, retrieval, or generation.
- Throws on failure (client sees error instead of silent loss).
- Enqueues ingestion once (skipped for entity-scoped sessions handled by `ingestMessageWithContext`).
- Returns `entryId` reused by mode router and downstream paths.

### Assistant messages — single durable write (stream)

- Removed duplicate `chat_messages.insert` from recall follow-up, mode handler, and memory recall branches in `omegaChatService.ts`.
- **`apps/server/src/routes/chat.ts` `persistAssistant`** is the sole stream-path writer:
  - Awaited before stream `done` event.
  - Errors logged at `error` level (not `warn`).
  - Metadata includes `recall_sources`, `response_mode`, sources, connections.

### Assistant messages — non-stream

- `chat()` assistant insert converted from fire-and-forget to `await` with `logger.error` on failure.

## Orphan metrics

Run:

```bash
npx tsx apps/server/scripts/chatTrustRecoveryAudit.ts
```

Key fields:

- `Orphan user turns (no reply)` — user messages without a following assistant reply in the same thread.
- `Missing assistant ratio` — orphan user turns / total user messages.
- `Orphaned messages (no session)` — rows in `chat_messages` whose `session_id` no longer exists in `conversation_sessions`.

Uses `threadRecoveryService.getThreadHealth()` and `countMissingAssistantTurns()` from `threadDurabilityChecks.ts`.

## Client-side durability (UI)

Message display durability is separate from DB persistence but equally trust-critical:

- **`mutateThreadMessages`** — functional updates prevent rapid append races.
- **Hydration local-wins** — server snapshot cannot shrink an in-flight multi-turn cache.

## Remaining notes

- Guest/offline paths still use localStorage; authenticated path is canonical via `chat_messages`.
- Ingestion enqueue on early user persist is intentional — user content should enter the memory pipeline even if the assistant path short-circuits.

## Files changed

- `apps/server/src/services/omegaChatService.ts`
- `apps/server/src/routes/chat.ts`
- `apps/web/src/features/chat/hooks/useChatThreads.ts`
- `apps/web/src/contexts/ChatThreadContext.tsx`

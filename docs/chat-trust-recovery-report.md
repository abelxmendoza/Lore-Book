# Chat Trust Recovery Report

**Sprint:** Chat Trust Recovery  
**Date:** 2026-06-16
**Status:** Fixes applied — live validation recommended

## Problem

Production trust failures:

1. **Messages appear missing** — multi-turn conversations collapsed to a single Q&A in the UI.
2. **Assistant responses felt generic** — relationship texture (closeness, trust, sentiment) was not reaching the streaming model.
3. **Persistence gaps** — fire-and-forget assistant writes could fail silently.

## Root causes

| Symptom | Root cause |
|---------|------------|
| One Q&A only in UI | Hydration replaced longer local cache with shorter server snapshot; rapid `addMessage` calls read stale `threadsRef` and overwrote each other |
| Generic replies (stream) | `entityAnalytics: null` hardcoded in `chatStream()` while non-stream path loaded full analytics |
| Lost assistant rows | Fire-and-forget `chat_messages.insert` in mode/recall paths and non-stream `chat()` |

## Fixes applied

### UI / client (`apps/web`)

- **`useChatThreads.hydrateThreadMessages`** — never replace local cache when `localMessages.length > serverMessages.length`.
- **`mutateThreadMessages`** — functional message updates with synchronous `threadsRef` commit; prevents user+assistant append race in one turn.
- **`ChatThreadContext.updateActiveMessages`** — uses `mutateThreadMessages` instead of stale `getThread()` snapshot.
- **`useChat.sendMessage`** — `addMessage` before navigate; conversation history from `getThread()` after sync ref update.

### Server (`apps/server`)

- **`entityAnalyticsLoader.ts`** — shared loader for relationship/closeness/trust/sentiment analytics.
- **`omegaChatService.chatStream()`** — calls `loadEntityAnalyticsForContext()`; removed `entityAnalytics: null`.
- **`persistUserMessageEarly()`** — user message saved before routing, retrieval, and generation.
- **Streaming paths** — removed duplicate fire-and-forget assistant inserts; durability delegated to `chat.ts` `persistAssistant`.
- **Non-stream `chat()`** — assistant insert now awaited with error logging.
- **`chat.ts persistAssistant`** — errors logged at `error` level; `recall_sources` included in metadata.

## Validation

Run the audit script:

```bash
npx tsx apps/server/scripts/chatTrustRecoveryAudit.ts
```

Manual checklist (Phase 4):

1. Create a new thread.
2. Send 20 messages (10 exchanges).
3. Verify all 20 messages visible without refresh.
4. Hard reload — all messages still present.
5. Switch threads and return — history intact.

## Success criteria

| Criterion | Status |
|-----------|--------|
| Multi-turn UI (not limited to one Q&A) | Fixed (client race + hydration) |
| User messages persist before generation | Fixed (`persistUserMessageEarly`) |
| Assistant messages awaited on stream path | Fixed (`persistAssistant`) |
| Entity analytics in streaming prompt | Fixed (`loadEntityAnalyticsForContext`) |
| Orphan ratio measured | Script available |

## Related docs

- [persistence-hardening-report.md](./persistence-hardening-report.md)
- [relationship-context-report.md](./relationship-context-report.md)

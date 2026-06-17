# Chat Durability Audit

Status: Chat Trust & Memory Recall Emergency Sprint — Phase 1 + Phase 2.
Evidence: live cloud DB (founder `789bd607…`) + code trace. Companions: [assistant-persistence-report.md](assistant-persistence-report.md), [recall-trace-report.md](recall-trace-report.md), [retrieval-quality-report.md](retrieval-quality-report.md).

## Verdict

"Messages disappear" is **real and proven in data**, but it is mostly **historical**: assistant persistence was unreliable until a durable-write fix landed **2026-06-16 (today)**. The new path works. What remains is (a) ~88 legacy user turns with no saved reply, (b) **residual structural fragility** in the recall/mode branches and trivial-message handling, and (c) a **legacy read-fallback** that can surface stale snapshots.

## Phase 1 — The write/read paths

### Write paths to `chat_messages` (the source of truth)
| Site | Role | Awaited? | Branch |
| --- | --- | --- | --- |
| `chat.ts:188` (`persistAssistant`) | assistant | ✅ awaited, once, with status | **stream path — the durable fix** |
| `omegaChatService.ts:1561` | user | ✅ awaited, returns id | main path (non-trivial only) |
| `omegaChatService.ts:817` | user | ✅ awaited | mode branch: **only** EXPERIENCE_INGESTION / ACTION_LOG |
| `omegaChatService.ts:651/867/944` | assistant | ❌ **fire-and-forget** (`.then().catch()`) | recall / follow-up branches |

**Single source of truth:** `chat_messages`, keyed by `(session_id, user_id)`. Good — one table. The danger is **which branch runs**, because user-message persistence is **not unconditional**.

### Read path
`threadContentService.loadThreadMessages()` (line 57): reads `chat_messages` by `session_id`; **if empty**, falls back to `conversation_messages` + `metadata.messages`. (Phase 2 detail below.)

## Phase 2 — Thread load audit

| Question | Answer |
| --- | --- |
| Canonical loader | `loadThreadMessages` → `chat_messages` first ✅ |
| Reads `conversation_messages`? | **Yes, as fallback** when `chat_messages` is empty (line ~95) |
| Reads `metadata.messages`? | **Yes, as fallback** (`metadataMessages(session.metadata)`) — also in `conversationService.ts:307`, `threadExplorerService.ts:100`, `threadDedupeService.ts:17` |
| Legacy snapshots maintained? | **No** — `threadRecoveryService` marks `metadata.messages` `@deprecated P2 — no longer maintained` |

**The fallback is a trap.** Because `metadata.messages`/`conversation_messages` are no longer written but still *read* when `chat_messages` is empty, a thread whose chat rows failed to persist can render **stale or partial** history from a dead snapshot — making the bug look intermittent ("sometimes my messages come back, sometimes not"). For the founder, `conversation_messages` = 11 vs `chat_messages` = 102, so the stores disagree.

## The data (why messages appear missing)

Founder `chat_messages`, by session (`role` balance is the bug's fingerprint):

```
session 6927adf5   71 user /  3 assistant     ← 68 replies never saved
session cdc552bb    6 user /  0 assistant
session 7010196d    6 user /  0 assistant
session 316b6cb1    4 user /  0 assistant
session 2803ba5a    0 user /  1 assistant     ← ORPHAN assistant (user msg dropped)
session d69fc58f    0 user /  1 assistant     ← ORPHAN assistant
TOTAL              95 user /  7 assistant
```

Two distinct failures:
1. **User-only sessions** (71/3, 6/0…): assistant replies were never persisted (historical — see persistence report; durable path is new as of today).
2. **Orphan assistant rows** (0 user / 1 assistant, dated 2026-06-14, `saved_from_stream` empty): the **recall/mode branch** saved the assistant fire-and-forget but **never saved the user message** (line 815 saves user only for INGESTION/ACTION_LOG). The user's question vanished; a reply hangs in a session with no question.

## Root causes (ranked)

1. **P0 (fixed today, verify holds):** assistant not durably persisted on the stream path. Fixed at `chat.ts:188`; newest rows show `saved_from_stream=true, stream_status=complete`. Monitor that the ratio normalizes going forward.
2. **P1 (active structural):** user-message persistence is **conditional and scattered**. In the mode-routing branch, only EXPERIENCE_INGESTION/ACTION_LOG save the user message; any other handled mode that returns at `:880` drops it. Recall branches also save the assistant **fire-and-forget**. → produces orphan rows.
3. **P1 (active):** **trivial messages never saved** (`:1555 if (!isTrivialMessage)`). "hi/ok/thanks" vanish on reload — looks like message loss to users.
4. **P2 (active):** **legacy read fallback** to `conversation_messages`/`metadata.messages` surfaces stale partial history, making loss look intermittent.
5. **P2 (suspected):** **session fragmentation** — many tiny user-only sessions suggest the client may not always adopt the server-resolved `sessionId`, scattering a single conversation across sessions. Worth a frontend trace (`ChatThreadProvider`/`useChatThreads` adoption of returned `sessionId`).

## Recommended fixes (durability)

1. **Persist the user message unconditionally and first** — move a single awaited `chat_messages` insert of the user turn to the very top of `chatStream` (before mode routing), and have every branch reference that id. Removes P1 #2 and #3 entirely.
2. **Never fire-and-forget a message write** — `await` the assistant inserts at 651/867/944, or route them through the single `persistAssistant` used by the stream path.
3. **Save trivial messages too** (or at least render them client-side persistently) — they're cheap and their absence reads as data loss.
4. **Demote the legacy read fallback** to an explicit one-time migration, not a live read path — once `chat_messages` is authoritative, stop reading `metadata.messages`/`conversation_messages` at load time.
5. **Confirm client session adoption** — ensure the SSE `metadata.sessionId` is captured and reused as `threadId` on subsequent sends.

(Backfill note: the ~88 historical missing assistant replies are unrecoverable — they were never written. This audit's fixes prevent recurrence; they cannot resurrect un-persisted streams.)

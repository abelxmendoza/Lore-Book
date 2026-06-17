# Assistant Persistence Report

Status: Chat Trust Sprint — Phase 3.
Companion: [chat-durability-audit.md](chat-durability-audit.md).

Question: does a streamed assistant reply get **saved, reloaded, and survive refresh** — and at what success rate?

## The persistence path (current, post-fix)

`chat.ts:182-210` — `persistAssistant(status)`:
- Persists exactly once (`assistantPersisted` guard).
- Persists on **complete** (stream finished), **partial** (client disconnected mid-stream / mid-stream throw), guarded so an empty response is skipped (user msg already durable).
- Writes `metadata.saved_from_stream = true` + `stream_status` so persistence is **observable in the row** — excellent for forensics.
- Bumps `conversation_sessions.updated_at` for ordering.

This is a solid design. The streamed reply is captured into `fullResponse` and flushed in the `finally`/catch arms, so a disconnect no longer loses the turn.

## Measured success rate (founder, live)

| Window | User msgs | Assistant msgs | Ratio |
| --- | --- | --- | --- |
| All time (since 2026-05-26) | 95 | 7 | **7.4%** |
| The durable-path rows (`saved_from_stream=true`) | — | **2** (both `complete`, dated 2026-06-16) | new path works |

Interpretation:
- The **7.4% lifetime rate** reflects a long period where assistant persistence was effectively absent/fire-and-forget. This is the historical damage behind "responses disappear."
- The **durable path is live as of 2026-06-16** and the only two rows written through it are `complete` — i.e. the fix works, but there is almost no post-fix sample yet. **The success rate cannot be declared healthy until more traffic flows through `saved_from_stream=true`.**

## Evidence of the pre-fix mechanisms

- Assistant rows dated 2026-06-09 / 06-14 have **no** `saved_from_stream` flag → written by the older **fire-and-forget** branches (`omegaChatService.ts:651/867/944`, `.then().catch()` swallow).
- Two of those are **orphans** (session has an assistant row but no user row) — the recall/mode branch saved the assistant without saving the user message.

## Persistence risk matrix

| Path | Assistant saved? | Durable (awaited)? | Survives refresh? |
| --- | --- | --- | --- |
| Stream, normal mode (today) | ✅ `chat.ts:188` | ✅ | ✅ |
| Stream, client disconnect | ✅ `partial` | ✅ | ✅ |
| Recall / follow-up branch | ⚠️ fire-and-forget | ❌ | ⚠️ races; may drop |
| Mode handler returns at `:880` | depends on mode | mixed | ⚠️ |
| Empty response (`fullResponse===''`) | ❌ skipped | n/a | n/a (by design) |

## Recommendations

1. **Funnel every assistant write through `persistAssistant`.** The recall/follow-up branches (651/867/944) should not have their own un-awaited inserts; they should set `fullResponse` and let the single durable path persist — eliminating orphans and races.
2. **Instrument a persistence SLO.** Emit a metric when an assistant turn completes vs when its row is confirmed written; alert if the confirmed/expected ratio drops below ~99%. The `saved_from_stream`/`stream_status` fields already make this measurable.
3. **Backfill is not possible** for the historical gap (those streams were never captured) — communicate this honestly; the value is forward durability.
4. **Add a post-fix verification probe:** re-run the per-session role-balance query in a week; a healthy system trends toward ~1:1 user:assistant on active threads.

# RELIABILITY AUDIT

Scope: the live authenticated chat loop — `POST /api/chat/stream` →
`omegaChatService.chatStream()` → ingestion queue → retrieval. This is the loop
that the product's value proposition ("remember and use my life over time")
lives or dies on.

Method: static trace of the real code paths. Key files:
`apps/server/src/routes/chat.ts`, `apps/server/src/services/omegaChatService.ts`,
`apps/server/src/services/conversationCentered/ingestionPipelineClass.ts`,
`apps/server/src/services/chat/memoryRetriever.ts`,
`apps/server/src/services/ingestion/ingestionQueue.ts`.

---

## Direct answers to the four questions

**Can a message ever disappear?**
*User messages: low risk.* `persistUserMessageEarly()` (omegaChatService.ts:702)
persists the user turn **before** routing/retrieval/generation — this is the
Chat-Trust-Recovery fix and it holds. *Assistant messages: low–moderate risk.* A
placeholder row is inserted up front (chat.ts:334) and finalized on
complete/partial/failed (chat.ts:347). The remaining gap: if the Node process is
killed mid-stream **after** generation but **before** `persistAssistant('partial')`
runs, the assistant turn is lost (no WAL/outbox). **P1.**

**Can a memory be stored but never retrieved?**
*Yes — this is the single biggest reliability risk.* Heavy ingestion is pushed to
an **in-memory queue** (`ingestionQueue.enqueue`, omegaChatService.ts:780). An
in-memory queue does not survive a deploy, crash, or OOM — any messages in flight
at restart are silently dropped and never become memory. Combined with
fire-and-forget ingestion (`ingestMessageWithContext(...).catch(...)`,
omegaChatService.ts:1942), a message can be acknowledged to the user, never
ingested, and therefore never retrievable. **P0 for the core promise.**

**Can retrieval fail silently?**
*Yes.* `memoryRetriever` issues an embedding call and vector search; failures are
caught and degrade to empty results, so a recall miss is indistinguishable from
"nothing to recall." There is no "retrieval degraded" signal surfaced to the user
or logged as a correctness event. A user asking "who do I know in aerospace?" can
get "I don't have that" because retrieval errored, not because the memory is
absent. **P1.**

**Can identity resolution corrupt existing memories?**
*Yes — structurally.* Per the project's own identity notes, there is **no single
resolve-before-write gate**; resolution happens in multiple places. Two failure
modes: (a) a new mention of "Tony" creates a *duplicate* entity instead of
merging, fragmenting his memory across two ids so later recall sees only half;
(b) an over-eager merge folds two distinct people into one, cross-contaminating
claims. Both silently corrupt the continuity graph. The append-only
`identity_mutations` ledger gives auditability but does not prevent the bad write.
**P0/P1.**

---

## Findings by severity

### P0 — Launch blockers
1. **Ephemeral ingestion queue.** `ingestionQueue` is in-memory; a restart loses
   queued work. Memory formation is the product — it must be durable
   (DB-backed outbox / pg-boss / Redis) with at-least-once delivery and a dead-letter
   path. (omegaChatService.ts:780, ingestion/ingestionQueue.ts)
2. **No unified resolve-before-write identity gate.** Duplicate/over-merge writes
   silently corrupt recall. Route all entity writes through one resolver
   (`entityResolutionCore`) before persistence.
3. **Silent ingestion failure = silent memory loss.** ~28 fire-and-forget
   `.catch()` background jobs in omegaChatService alone (compaction, memoir,
   lifestory, group detection, epiphany, **entity-context ingestion**). A failure
   in the ingestion `.catch()` is logged at warn and otherwise invisible — there is
   no per-message "ingestion succeeded" guarantee or retry.

### P1 — Must fix before scale
4. **No retry on ingestion / retrieval.** Failures are terminal for that message.
5. **Mid-stream crash loses assistant turn** (no outbox for the final persist).
6. **Retrieval failures are silent** (no correctness signal / metric).
7. **Race: ingestion lag vs next message.** Ingestion takes ~8–15s
   (the client long-polls 2×8s, chat.ts:649). If the user sends Wednesday's "Tony
   got promoted" before Monday's ingestion committed, resolution may not find Tony
   yet → duplicate. No ordering guarantee across a user's queued jobs.
8. **Duplicate processing.** One message fans out to message-level + per-unit ER +
   perception + event-assembly ingestion; a short-TTL cache
   (`INGEST_CACHE`, omegaMemoryService.ts) dedups within a process but not across
   the (in-memory) queue or after restart.

### P2 — Post-launch
9. Thread corruption: assistant placeholder + finalize is sound, but
   `compactionService.compact(...).catch()` (omegaChatService.ts:1752) mutates
   thread history fire-and-forget; a failure mid-compaction could leave a thread in
   a partially-compacted state. Add a transaction / version guard.
10. No idempotency key on ingestion — a retried job could double-write claims.

---

## Recommended reliability bar before launch
- Durable, at-least-once ingestion queue with idempotency keys + dead-letter.
- One resolve-before-write entity gate.
- A per-message **ingestion receipt** (status row) the UI already half-expects via
  `memory-feedback` long-poll — make it authoritative, retried, and alertable.
- A retrieval-health metric (recall attempts vs hits vs errors).

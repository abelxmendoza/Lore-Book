# Chat durability boundary — autobiographical continuity under assistant failure

Date: 2026-07-11

## Product invariant

Once Lorekeeper acknowledges receipt of a user message:

1. The original user message is durable.
2. Its ingestion state is observable.
3. Failures can be retried safely.
4. No duplicate autobiographical records are created.
5. Assistant response failure does **not** imply memory loss.

Naming: **Lorekeeper** = runtime/engine; **Lorebook** = product surface.

---

## 1. Failure-path analysis (pre-fix)

### Production path

```text
web submit (useChat → useChatStream)
→ POST /api/chat/stream (routes/chat.ts)
→ optionalAuth + AI rate limits
→ omegaChatService.chatStream
→ persistUserMessageEarly (chat_messages insert)
→ ingestionQueue.enqueue (was fire-and-forget)
→ mode router / RAG / prompt assembly
→ createOpenAIChatStream  ← 429 often here
→ SSE stream → assistant finalize
→ async extractors / engines
```

### Exact failure points (questions from the brief)

| # | Question | Location | Pre-fix behavior |
|---|----------|----------|-------------------|
| 1 | User message first persisted | `omegaChatService.persistUserMessageEarly` → `chat_messages` | Already early — good |
| 2 | Ingestion triggered | same method → `ingestionQueue.enqueue` | After save, before OpenAI |
| 3 | Ingestion depends on assistant success? | **No** for happy path | But error **claimed** it did |
| 4 | OpenAI 429 aborts request | `createOpenAIChatStream` throw → `chat.ts` catch | Hard-coded `user_message_saved: false` |
| 5 | Background promises lost | `void persistThenQueue` | Race: crash before WAL write |
| 6 | Retry duplicates messages | No client idempotency key | New row every retry |
| 7 | Frontend “may not have completed” | `useChat.ts` `friendlyErrorMessage` | Pessimistic copy |
| 8 | Ingestion status stored | `ingestion_jobs` + `pipeline_runs` | Not returned to client |
| 9 | Railway restart strands work | `ingestionQueue.recover()` on boot | Only if row was persisted |
| 10 | Multiple OpenAI calls / send | Response + RAG dates + mode + interpretation + ~30 extractors | Shared quota |

**Root user-visible bug:** durable save already existed, but the **API and UI lied** after assistant 429, training users to resend and risking duplicates.

---

## 2. Architecture decision

Reuse existing **Postgres-backed** `ingestion_jobs` + in-process `IngestionQueue` (no Redis).

```text
1. Accept auth + validate
2. Persist user message (idempotent by clientIdempotencyKey)
3. Await enqueueDurable → ingestion_jobs WAL row
4. Attempt assistant generation
5. On assistant failure → ChatDurabilityError with truth payload
6. Worker processes job independently (retries / reclaim)
7. Client shows saved/queued; refresh reconciles via thread hydrate
```

### State machine

```text
RECEIVED → PERSISTED → QUEUED → PROCESSING ⇄ PARTIAL
                              ↓
                     RETRYABLE_FAILED → QUEUED (backoff)
                              ↓
                     PERMANENT_FAILED | COMPLETED | CANCELLED
```

Wire column `status` remains `pending|processing|dead` for back-compat; `logical_status` holds the explicit machine.

### Failure-domain separation

| Domain | Independent outcome |
|--------|---------------------|
| Message acceptance | `chat_messages` row + optional `client_idempotency_key` |
| Assistant generation | SSE / JSON assistant status |
| Ingestion | `ingestion_jobs` + `pipeline_runs` |

Neither assistant nor ingestion failure rolls back the user message.

---

## 3. Database

Migration: `supabase/migrations/20260711120000_ingestion_job_state_machine.sql`

- Extends `ingestion_jobs` with stages, lock, retry metadata, logical status
- Adds `chat_messages.client_idempotency_key` + unique (user_id, key)

---

## 4–8. Implementation summary

| Area | Files |
|------|-------|
| State + classify | `ingestionJobStates.ts`, `chatDurability.ts` |
| Job store / queue | `ingestionJobStore.ts`, `ingestionQueue.ts` (`enqueueDurable`) |
| Persist early | `omegaChatService.persistUserMessageEarly` awaits durable enqueue |
| OpenAI wrap | `ChatDurabilityError` around `createOpenAIChatStream` |
| API | `routes/chat.ts` truthful 429; `/messages/:id/durability`, `retry-ingestion` |
| Recovery | `ingestionRecoveryService.ts`, `POST /diagnostics/ingestion-recovery`, `scripts/ingestion-recovery.mjs` |
| Frontend | `useChatStream` + `useChat` idempotency key, durability-aware error UX |

---

## 9. Tests (executed)

```text
apps/server: 30 tests passed (job states, store, queue serialization, durability contract)
apps/web:    6 tests passed (friendlyErrorMessage + useChat durability)
omegaChatService.error: 2 passed
```

---

## 10. OpenAI call budget (code audit)

| Tier | Calls | When |
|------|-------|------|
| 0 | 0 LLM | Persist message + durable job |
| 1 Core ingestion | Many extractors (queue, off critical path) | After Tier 0 |
| 2 Assistant | 1 streaming completion (`createOpenAIChatStream`) | After Tier 0 |
| 3 Derived | Interpretation/agents, essence, RAG date LLM (gated by temporal signal), mode router LLM when low confidence | Parallel / deferred |

**Before:** Tier 0 enqueue was fire-and-forget; 429 response claimed Tier 0 failed.  
**After:** Tier 0 awaited; 429 returns saved + queued; assistant call count unchanged (1 stream).  
Core autobiographical continuity is no longer blocked by Tier 2 failure.

Latency impact: one awaited `ingestion_jobs` upsert (~few ms–tens of ms) before stream setup.

---

## 11. Remaining risks

- Full pipeline still re-runs on job retry (stage resume is tracked, not yet fine-grained resume inside all extractors).
- `enqueueDurable` degrades to in-memory if `ingestion_jobs` is down (logged).
- Non-stream `POST /api/chat` not fully wired with the same durability error type (stream is primary).
- Optional enrichment still competes for OpenAI quota with assistant under load (separate queues/priorities are future work).
- Migration must be applied on Supabase before client idempotency unique index is live.

---

## 12. Rollout / rollback

**Rollout**

1. Apply migration `20260711120000_ingestion_job_state_machine.sql`.
2. Deploy server (Railway) then web.
3. Smoke: send fixture message; force 429 (circuit/budget or mock); confirm message row + job row; UI copy mentions saved/queued.
4. `POST /api/diagnostics/ingestion-recovery` dry-run for the operator account.

**Rollback**

1. Redeploy previous server/web images.
2. New columns are additive — leave migration in place.
3. Old code continues to use `status` pending/processing/dead.

---

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| User message durable before assistant can fail | Yes (`persistUserMessageEarly` + await job) |
| Every message has job or repairable condition | Job on non-trivial text; recovery scan finds gaps |
| Independent assistant vs ingestion outcomes | `ChatDurabilityPayload` |
| Replays don’t duplicate messages | `client_idempotency_key` unique |
| Stale jobs reclaimable | `reclaimStaleLocks` + `recover()` |
| Frontend recovers after refresh | hydrate on error + existing thread hydrate |
| 429 truth-backed | `ChatDurabilityError` + new copy |
| Core ingestion without assistant | Unchanged queue path, now durable first |
| Ops tooling | recovery service + CLI + diagnostics |
| Tests green | See §9 |

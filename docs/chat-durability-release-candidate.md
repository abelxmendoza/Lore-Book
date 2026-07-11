# Chat durability — production release candidate

Date: 2026-07-11

## 1. Remaining-gap analysis (closed this pass)

| Gap | Fix |
|-----|-----|
| In-memory degrade claimed QUEUED on WAL failure | `persist()` returns `{ok:false}`; `enqueueDurable` → `RECOVERY_REQUIRED` |
| Overloaded `userMessage` string vs object | `notice.message` + structured `userMessage` only |
| No fencing for stale workers | `lease_token` + `attempt_version` + `fencedUpdate` |
| Recovery not discoverable without job row | `chat_messages.metadata.ingestion_recovery` |
| Provider pressure shared with enrichment | `providerPressurePolicy` normal/degraded/critical |
| No unified CI gate | `npm run test:trust-floor` |

## 2. Artifact idempotency matrix

| Artifact | Table / model | Creation path | Source identity | Unique / upsert | Replay behavior | Risk | Tests |
|----------|---------------|---------------|-----------------|-----------------|-----------------|------|-------|
| User message | `chat_messages` | `persistUserMessageEarly` | `user_id` + `client_idempotency_key` | Unique partial index | Reuse row | Low | unit |
| Ingestion job | `ingestion_jobs` | `enqueueDurable` | `idempotency_key` = message id | UNIQUE | Skip duplicate | Low | unit |
| Pipeline run | `pipeline_runs` | queue process | job_id + message | Index by message | New run rows OK | Med | existing |
| Characters | `characters` | entity resolution | user + normalized name | Registry + Jaro-Winkler | Merge path | Med | trust-floor |
| Locations | `locations` | place authority | user + taxonomy key | Canonical upsert | Merge path | Med | docs |
| Episodes | `episodes` | segmentation | `source_message_ids[]` | Evidence required | Deterministic segment | Med | artifact keys |
| Events | `resolved_events` / `conversation_events` | assembly | message + time + entities | Partial uniqueness varies | Upsert by source | **Med-High** | replay unit |
| Claims / KU | `knowledge_units` | crystallization | evidence links | Provenance links | Evidence-backed only | Med | existing |
| Relationships | relationship tables | extractors | user + pair + type | Upserts / edges | Dedup edges | Med | existing |
| Provenance | `provenance_edges` | writers | subject + source | Indexes | Idempotent insert patterns | Med | existing |
| Embeddings | vector tables | embed services | artifact id + version | Upsert by id | Overwrite same | Low | n/a |
| Contradictions | contradiction tables | engine | user + pair of claims | Lifecycle states | Recompute safe | Med | n/a |
| Preferences | revealed preference | engine | episode-linked | Unique episode signal | Idempotent re-scan | Low | migration |

**Deterministic key formula (recommended / tested):**

```text
sha256(userId | sourceMessageId | extractorVersion | artifactType | subject | object | relation)
```

Timestamps and random UUIDs must not be the only dedup mechanism for replayable extracts.

## 3. Concurrency / fencing

```text
claim(job) → lease_token + attempt_version
process → fenced stage/complete writes
reclaim stale lock → clear lease, bump version on next claim
stale worker complete → fencedUpdate returns false
```

Migration: `20260711130000_ingestion_job_fencing.sql`

## 4. Fault injection

Module: `durabilityFaultInjection.ts`  
Enable: `DURABILITY_FAULT_INJECTION=true` or `NODE_ENV=test`  
Points: before/after message persist, job enqueue, worker claim, job completion, etc.

## 5. Provider pressure

```text
normal   → assistant + core + enrichment
degraded → enrichment deferred; core prioritized
critical → raw message + durable state; enrichment waits; backoff ×8
```

## 6. API contract (fixed)

```json
{
  "userMessage": { "id": "...", "persisted": true },
  "assistantResponse": { "status": "failed", "errorCategory": "rate_limit" },
  "ingestion": { "jobId": "...", "status": "QUEUED" },
  "notice": { "code": "message_saved_assistant_failed", "message": "I saved your message..." },
  "durability": { "...": "..." },
  "memory": { "user_message_saved": true, "ingestion_started": true }
}
```

`userMessage` is **never** a string.

## 7. Security

| Control | Status |
|---------|--------|
| Durability GET scoped by auth user | Yes (`eq user_id`) |
| Retry-ingestion auth only | Yes; no client userId |
| Retry rate limit | 5/msg/hour + openAiHttpLimit |
| Job payload no tokens | conversationHistory truncated content only |
| Fault injection prod | Requires env flag |
| Recovery diagnostics | requireAuth; self-scoped |

## 8. Migration validation

| Check | Result |
|-------|--------|
| Additive columns | Yes (nullable / defaults) |
| Old server reads new schema | Compatible (ignores new cols) |
| New server without migration | Lease/claim falls back to markProcessing |
| `client_idempotency_key` unique | Partial unique WHERE NOT NULL — existing nulls OK |
| Idempotent migration | `IF NOT EXISTS` |

## 9. Railway / process restart

**Demonstrated (process-level):**

1. `recover()` on boot reloads `pending|processing` jobs  
2. `reclaimStaleLocks` clears stale `locked_at`  
3. Fencing prevents late complete after reclaim  

**Limitation:** Live Railway SIGTERM inject was not executed against production. Closest reproduction: in-process reclaim + unit fencing model. Use dedicated test user for any live restart drill.

## 10. Trust floor

```bash
npm run test:trust-floor
```

## 11. Production smoke checklist

| # | Scenario | Action | API | UI | DB | Metrics | Rollback if |
|---|----------|--------|-----|----|----|---------|-------------|
| 1 | Normal chat | Send message | stream OK + durability QUEUED | bubbles saved | message+job | persist+queue | errors >5% |
| 2 | Assistant 429 after save | Fault after enqueue | notice saved+queued; status 429 | user saved | message+job | assistant_failure | claims unsaved |
| 3 | Assistant timeout | Mid-stream kill | partial assistant | partial text | user saved | stream error | user lost |
| 4 | Job WAL fail | Fault durable write | RECOVERY_REQUIRED | saved, not queued | metadata recovery | recovery_required | claims QUEUED |
| 5 | Extractor retry | Inject 429 in worker | job RETRYABLE | quiet | attempts++ | stage_failure | infinite loop |
| 6 | Worker restart | Kill mid-process | — | — | lock reclaimed | stale_reclaimed | stuck PROCESSING |
| 7 | Duplicate send | Same idempotency key | same message id | one bubble | one row | dup_sends_prevented | 2 rows |
| 8 | Refresh after fail | Reload thread | hydrate | correct state | — | — | ghost bubbles |
| 9 | Manual retry | POST retry-ingestion | QUEUED | status chip | new attempt | — | 429 spam |
| 10 | Completed replay | force re-ingest | DUPLICATE/force key | — | no dup core | — | dup entities |
| 11 | Entity type mismatch | Bad composer entity | sanitized | no crash | no wrong type | — | wrong entity |
| 12 | Cross-user | Other user's messageId | 404 | — | no leak | — | 200 |

## 12. Go / no-go

**Conditional GO** after:

1. Apply migrations `20260711120000` + `20260711130000` on staging  
2. `npm run test:trust-floor` green  
3. Staging smoke rows 1, 2, 4, 6, 7  
4. Confirm no production fault-injection env set  

**NO-GO** if: WAL failure still reported as QUEUED; cross-user durability leak; trust-floor red.

## Remaining risks

- Full pipeline extractor uniqueness not fully constrained at DB for every table  
- Enrichment under critical pressure still may race if not all call sites check policy  
- Live Railway restart drill pending  
- Non-stream `POST /api/chat` secondary path less fully wired  

## Files changed (this pass)

- `ingestionJobStore.ts`, `ingestionQueue.ts`, `ingestionJobStates.ts`
- `chatDurability.ts`, `durabilityApiContract.ts`, `durabilityFaultInjection.ts`, `providerPressurePolicy.ts`
- `omegaChatService.ts`, `routes/chat.ts`, `ingestionRecoveryService.ts`
- Frontend `useChatStream.ts`
- Migrations fencing; tests; `scripts/trust-floor.mjs`; this doc

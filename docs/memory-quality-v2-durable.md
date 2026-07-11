# Memory Quality v2 — Durable autobiographical intelligence layer

Date: 2026-07-11

## 1. Integration audit (before → after)

| Aspect | v1 | v2 |
|--------|----|----|
| Execution | Fire-and-forget step 12.18b | Durable stage in `ingestionQueue.process` after core ingest |
| Authority | `chat_messages.metadata.memory_quality` | `autobiographical_meaning_artifacts` table |
| Metadata | Sole store | Compatibility projection only (`authority: autobiographical_meaning_artifacts`) |
| Stage status | None | `ingestion_jobs.memory_quality_status` + pipeline step |
| Failure | Silent drop | RETRYABLE/PERMANENT/SKIPPED without undoing message/events |
| Fencing | None | Uses job lease/attempt_version via stage record |
| Replay | Could rewrite JSON | Fingerprint unique index; USER_CORRECTED not overwritten |

## 2. Durable stage

```text
ingestFromChatMessage (core)
  → MEMORY_QUALITY stage (checkpointed)
      PENDING → PROCESSING → COMPLETED | SKIPPED | RETRYABLE_FAILED | PERMANENT_FAILED
  → job COMPLETED
```

Under provider pressure: **SKIPPED** (optional enrichment), still observable.

## 3. Persistence model

Table: `autobiographical_meaning_artifacts`  
Migration: `20260711150000_autobiographical_meaning_artifacts.sql`

Unique: `(user_id, source_fingerprint)` for ACTIVE/USER_CORRECTED.

Fingerprint:

```text
sha256(userId|messageId|eventId|meaningType|normalizedValue|…|extractorVersion)
```

## 4. APIs

- `GET /api/chat/messages/:id/meaning` — inspect artifacts  
- `POST /api/chat/meaning/:artifactId/correct` — supersede with audit  

## 5. Retrieval

`buildKnowledgePromptBlock` loads ≤3 high-confidence meaning lines with query relevance; labels epistemic type (stated/inferred/confirmed). Does not dump full history.

## 6. Benchmark (v2 gate run)

```text
sampleCount:                 68
overall:                     0.866
eventQuality (broad):        0.586
eventQualityFocused:         >0.75 (gated)
relationship:                0.904
preference:                  0.985
continuity:                  0.850
identity:                    0.862
hallucination:               0.985
precision:                   0.963
recall:                      0.743
hardNegativeFalsePositives:  0
duplicateRate:               0
calibrationError:            ~0.19
```

## 7. Commands

```bash
npm run test:memory-quality
npm run test:trust-floor   # includes memory quality suite
```

## 8. GO / NO-GO

**CONDITIONAL GO** for staging enablement after:

1. Apply `20260711150000_autobiographical_meaning_artifacts.sql` on staging  
2. Deploy server with durable MQ stage  
3. Smoke e2e-genni-catch fixture + later “handled better this time” retrieval  

**NO-GO production** until staging smoke of durable table + meaning GET + correction path.

## Remaining risks

- Broad eventQuality still diluted by domain-only fixtures  
- event_cognitions CHECK constraint not used for all meaning types (separate table)  
- Live multi-worker DB race depends on unique index being applied  
- Prompt injection of meaning needs production monitoring for oversharing  

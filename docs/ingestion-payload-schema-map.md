# Ingestion payload schema map (Phase 4)

**Source of truth:** `packages/api-contracts/src/ingestion/**`  
**Vercel mirror:** `apps/web/src/lib/api-contracts/ingestion/**` (synced; parity test enforced)  
**Schema version:** `1` (`INGESTION_SCHEMA_VERSION`)

## Envelope (every job)

| Field | Required | Notes |
|-------|----------|--------|
| `schemaVersion` | yes | Literal `1` |
| `jobType` | yes | Discriminator |
| `userId` | yes | Owner |
| `sourceMessageId` | yes | Chat message / evidence root |
| `sourceThreadId` | when available | Session / thread |
| `createdAt` | yes | ISO string |
| `idempotencyKey` | yes | Dedupe / force keys |
| `payload` | yes | Job-type-specific |

## Job types → payload schemas

| jobType | Payload schema | Purpose |
|---------|----------------|---------|
| `conversation_ingestion` | `conversationIngestionPayloadSchema` | Chat WAL re-ingest (history + force) |
| `memory_proposal` | `memoryProposalPayloadSchema` | Atomic typed proposals for MRQ |
| `entity_candidate` | `entityCandidatePayloadSchema` | Named entities with allowed types |
| `relationship_candidate` | `relationshipCandidatePayloadSchema` | Two endpoints + specific type + evidence |
| `event_candidate` | `eventCandidatePayloadSchema` | Occurred vs recorded temporal + eligibility |
| `correction_mutation` | `correctionMutationPayloadSchema` | Supersede / replace claims |
| `retraction_mutation` | `retractionMutationPayloadSchema` | Retract claim IDs |
| `consolidation_job` | `consolidationJobPayloadSchema` | Batch consolidate domains |

## Validation boundaries

1. **Write** (`gateConversationIngestionWrite` / `gateIngestionPayloadForWrite`) before `ingestion_jobs` upsert  
2. **Store** refuses unversioned payloads (`schemaVersion` required)  
3. **Read/recover** (`gateIngestionPayloadForRead`) on worker recover  
4. **Process** re-validates conversation envelope before claim  

Invalid → `PERMANENT_FAILED` + `ingestion_dead_letter` with `schemaRejection` + diagnostics. **No retry loop** for structural/semantic schema failures (`category: validation`, `code: PAYLOAD_SCHEMA_INVALID`).

## Compatibility

| Input | Behavior |
|-------|----------|
| Full V1 envelope | Strict parse |
| Legacy `{ conversationHistory?, force? }` only | **Explicit** adapt to `conversation_ingestion` with `legacyAdapted` metric — never invents entities/relationships |
| Unversioned unknown shapes | Reject / quarantine |
| `schemaVersion !== 1` | Reject (`unknown_schema_version`) |

## Producers / consumers (this PR)

| Path | Role |
|------|------|
| `ingestionQueue.persistThenQueue` | Producer gate (conversation) |
| `ingestionJobStore.persist` | Defense: reject unversioned |
| `ingestionQueue.recover` | Consumer gate + quarantine |
| `ingestionQueue.process` | Worker re-validate |
| Future typed producers | Build envelopes with package helpers |

## Rejected real-world examples (fixtures)

- `"User has a coworker relationship."` without two distinct endpoints  
- Entity `PERSON` named `tonight` / commands / software / occupations-as-people  
- Event with `eligibilityReason: raw_conversation_capture`  
- Correction with empty `targetClaimIds` and empty provenance  
- Unversioned `{ foo: 1 }` blobs  

## Metrics (`ingestionPayloadMetrics`)

- `validated_ok`, `legacy_adapted`, `rejected`, `dead_lettered_invalid`  
- `by_job_type`, `by_schema_version`, `by_rejection_reason`  

## Mirror drift prevention

1. Edit **only** `packages/api-contracts`  
2. Sync copy into `apps/web/src/lib/api-contracts`  
3. `apps/web/src/lib/api-contracts/mirrorParity.test.ts` fails if content diverges when package is present  

# Phase 4B — Stage contracts in the live pipeline

## Post-conversation pipeline map

```
chat persist
  → ingestionQueue.enqueueDurable
      → gateConversationIngestionWrite (V1 envelope)
      → ingestion_jobs.payload
  → process()
      → re-validate conversation envelope
      → conversationIngestionPipeline.ingestFromChatMessage
          → normalize / split
          → omegaMemoryService.extractEntities + resolveEntities
              → createEntity  ★ validateEntityCandidateBeforePersist
          → hybrid semantic units → extracted_units
          → unified ER
              → writeRelationship  ★ validateRelationshipBeforeWrite
          → correctionResolutionService
          → queueExtractedUnitForReview
              → memoryReviewQueueService.ingestMemory
                  ★ validateMemoryProposal / correction / retraction
          → (async) eventAssemblyService.assembleEvents
              → evaluateLifeLogEligibility
              → createOrUpdateEvent  ★ validateEventBeforePersist
      → MEMORY_QUALITY
      → markCompleted
```

## Durable job vs synchronous validation

| Type | Decision | Rationale |
|------|----------|-----------|
| `conversation_ingestion` | **Durable job** | WAL for crash recovery of full message pipeline |
| `entity_candidate` | **Sync stage gate** | High volume; gate at `createEntity` / resolve |
| `relationship_candidate` | **Sync stage gate** | Must not write one-sided edges; gate at `writeRelationship` |
| `event_candidate` | **Sync stage gate** | Life Log purity; gate at assembly insert + eligibility policy |
| `memory_proposal` | **Sync stage gate** | MRQ insert path; fingerprint merge already handles dupes |
| `correction_mutation` / `retraction_mutation` | **Sync stage gate** | Applied via MRQ / correction services |
| `consolidation_job` | **Future durable** | Batch ops not yet chat-hot |

Contracts are behaviorally active at **trust boundaries** without exploding job count.

## Producers wired

| Producer | File | Gate |
|----------|------|------|
| Entity create | `omegaMemoryService.createEntity` | `validateEntityCandidateBeforePersist` |
| Entity resolve skip | `resolveEntitiesUncached` | catches `ENTITY_CANDIDATE_REJECTED` |
| Relationship write | `er/writeRelationship.ts` | `validateRelationshipBeforeWrite` |
| Life Log event | `eventAssemblyService.createOrUpdateEvent` | `validateEventBeforePersist` + eligibility |
| MRQ | `memoryReviewQueueService.ingestMemory` | memory/correction/retraction validators |

## Failure handling

- Invalid **entity** → not created; resolve continues with other candidates  
- Invalid **relationship** → skip write; entities remain  
- Invalid **event** → no insert; no “Captured Conversation” fallback  
- Invalid **memory proposal** → `REJECTED` proposal row with diagnostics; no auto-approve  
- Schema invalid **jobs** (Phase 4A) → dead-letter + `PERMANENT_FAILED`  

## Metrics

- Job payload: `ingestionPayloadMetrics` (by jobType / rejection / dead-letter)  
- Stage: `stageContractMetrics` (`produced|validated|accepted|rejected|retyped|persisted` per kind + reasons)  

Exposed on `ingestionQueue.stats().payloadValidation` and `getStageContractMetrics()`.

## Mirror

`packages/api-contracts` remains source of truth; `apps/web/src/lib/api-contracts` vendored for Vercel; `mirrorParity.test.ts` enforces sync.

## Remaining loose structures

- `UnifiedExtractionPayload` internal LLM blob (still only applied to interests/quests/skills)  
- Utterance/extracted_unit metadata bags  
- Some romantic / kinship detectors write domain tables without ER gate (next pass)  
- Direct `ingestMessage` API bypass of WAL still runs stage gates (createEntity/writeRelationship/MRQ/events)  

## Confirmation

Observed garbage classes (**tonight-as-PERSON**, **endpoint-less coworker**, **generic Captured Conversation events**, **untyped relationship shells**) now fail **before** canonical tables when they pass through wired producers.

/**
 * Stage-level contract validation for post-conversation pipeline.
 *
 * Job boundary: conversation_ingestion is durable (queue).
 * Candidate types are validated **synchronously** at trust boundaries before
 * canonical persistence — not as separate queue jobs (avoids orchestration explosion).
 *
 * @see docs/ingestion-stage-contracts-4b.md
 */

import {
  entityCandidatePayloadSchema,
  relationshipCandidatePayloadSchema,
  eventCandidatePayloadSchema,
  memoryProposalPayloadSchema,
  correctionMutationPayloadSchema,
  retractionMutationPayloadSchema,
  entityTypeBlocksName,
  isInvalidPersonName,
  suggestEntityTypeForName,
  type EntityCandidatePayload,
  type RelationshipCandidatePayload,
  type EventCandidatePayload,
  type MemoryProposalPayload,
  type CorrectionMutationPayload,
  type RetractionMutationPayload,
} from '@lorebook/api-contracts';
import { logger } from '../../logger';
import {
  recordStageCandidate,
  type StageCandidateKind,
} from './stageContractMetrics';

export type StageReject = {
  accepted: false;
  reason: string;
  kind: StageCandidateKind;
  diagnostics?: Record<string, unknown>;
};

export type StageAccept<T> = {
  accepted: true;
  value: T;
  kind: StageCandidateKind;
};

export type StageResult<T> = StageAccept<T> | StageReject;

function reject(
  kind: StageCandidateKind,
  reason: string,
  diagnostics?: Record<string, unknown>,
): StageReject {
  recordStageCandidate(kind, 'rejected', reason);
  logger.debug({ kind, reason, diagnostics }, 'stageContractGate rejected candidate');
  return { accepted: false, reason, kind, diagnostics };
}

function accept<T>(kind: StageCandidateKind, value: T): StageAccept<T> {
  recordStageCandidate(kind, 'accepted');
  return { accepted: true, value, kind };
}

// ─── Entity ─────────────────────────────────────────────────────────────────

const OMEGA_TO_CONTRACT: Record<string, EntityCandidatePayload['entityType']> = {
  PERSON: 'PERSON',
  CHARACTER: 'CHARACTER',
  LOCATION: 'LOCATION',
  PLACE: 'PLACE',
  ORGANIZATION: 'ORGANIZATION',
  ORG: 'ORGANIZATION',
  PROJECT: 'PROJECT',
  SKILL: 'SKILL',
  EVENT: 'EVENT',
  PRODUCT: 'OTHER',
  APP: 'OTHER',
  OTHER: 'OTHER',
};

export function validateEntityCandidateBeforePersist(input: {
  name: string;
  type: string;
  evidenceIds: string[];
  confidence?: number;
}): StageResult<{ name: string; type: string; retyped?: string }> {
  recordStageCandidate('entity_candidate', 'produced');
  const name = (input.name ?? '').trim();
  const typeUpper = (input.type ?? 'OTHER').toUpperCase();

  // PERSON pollution: reject or retype before any insert
  if (typeUpper === 'PERSON' || typeUpper === 'CHARACTER') {
    const bad = isInvalidPersonName(name);
    if (bad.invalid) {
      const suggested = suggestEntityTypeForName(name);
      if (suggested && suggested !== 'PERSON' && suggested !== 'CHARACTER') {
        recordStageCandidate('entity_candidate', 'retyped', bad.reason);
        const contractType = suggested;
        const payload: EntityCandidatePayload = {
          name,
          entityType: contractType,
          confidence: input.confidence ?? 0.6,
          evidenceIds: input.evidenceIds.length ? input.evidenceIds : ['pipeline'],
        };
        const parsed = entityCandidatePayloadSchema.safeParse(payload);
        if (!parsed.success) {
          return reject('entity_candidate', bad.reason ?? 'invalid_person_name', {
            issues: parsed.error.issues,
          });
        }
        return accept('entity_candidate', {
          name,
          type: suggested === 'LOCATION' ? 'LOCATION' : suggested === 'ORGANIZATION' ? 'ORGANIZATION' : 'OTHER',
          retyped: suggested,
        });
      }
      return reject('entity_candidate', bad.reason ?? 'invalid_person_name', { name, type: typeUpper });
    }
  }

  const block = entityTypeBlocksName(typeUpper, name);
  if (block) {
    return reject('entity_candidate', block, { name, type: typeUpper });
  }

  const entityType = OMEGA_TO_CONTRACT[typeUpper] ?? 'OTHER';
  const payload: EntityCandidatePayload = {
    name,
    entityType,
    confidence: input.confidence ?? 0.6,
    evidenceIds: input.evidenceIds.length ? input.evidenceIds : ['pipeline'],
  };
  const parsed = entityCandidatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('entity_candidate', 'structural_invalid', { issues: parsed.error.issues });
  }
  recordStageCandidate('entity_candidate', 'validated');
  return accept('entity_candidate', { name, type: typeUpper });
}

// ─── Relationship ───────────────────────────────────────────────────────────

export function validateRelationshipBeforeWrite(input: {
  subjectEntityId: string;
  objectEntityId: string;
  relationshipType: string;
  evidenceIds: string[];
  confidence?: number;
  description?: string;
  temporalStatus?: 'active' | 'ended' | 'uncertain' | 'planned';
}): StageResult<RelationshipCandidatePayload> {
  recordStageCandidate('relationship_candidate', 'produced');
  const payload: RelationshipCandidatePayload = {
    subjectEntityId: input.subjectEntityId,
    objectEntityId: input.objectEntityId,
    relationshipType: input.relationshipType,
    description: input.description,
    confidence: input.confidence ?? 0.5,
    evidenceIds: input.evidenceIds.length ? input.evidenceIds : ['pipeline'],
    temporalStatus: input.temporalStatus ?? 'uncertain',
  };
  const parsed = relationshipCandidatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('relationship_candidate', 'schema_or_semantic_invalid', {
      issues: parsed.error.issues,
      description: input.description,
    });
  }
  recordStageCandidate('relationship_candidate', 'validated');
  return accept('relationship_candidate', parsed.data);
}

// ─── Event ──────────────────────────────────────────────────────────────────

export function validateEventBeforePersist(input: {
  title: string;
  occurredAt: string | null;
  recordedAt: string;
  temporalPrecision?: string;
  temporalSource?: string;
  eligibilityEligible: boolean;
  eligibilityReason: string;
  confidence?: number;
  evidenceIds: string[];
  publishableTitle: boolean;
}): StageResult<EventCandidatePayload | { quarantined: true; reason: string }> {
  recordStageCandidate('event_candidate', 'produced');

  if (!input.eligibilityEligible) {
    return reject('event_candidate', `life_log_ineligible:${input.eligibilityReason}`, {
      title: input.title,
    });
  }
  if (!input.publishableTitle) {
    return reject('event_candidate', 'unpublishable_title', { title: input.title });
  }

  // Map life-log reasons to event eligibility for contract
  const reasonMap: Record<string, EventCandidatePayload['eligibilityReason']> = {
    personal_event: 'dated_experience',
    state_transition: 'anchored_occurrence',
    project_milestone: 'anchored_occurrence',
    relationship_event: 'dated_experience',
    visit: 'dated_experience',
    attended_event: 'dated_experience',
    intentional_nonattendance: 'user_asserted_event',
  };
  const eligibilityReason = reasonMap[input.eligibilityReason] ?? 'user_asserted_event';

  const payload = {
    title: input.title,
    occurredAt: input.occurredAt ?? input.recordedAt,
    recordedAt: input.recordedAt,
    temporalPrecision: (input.temporalPrecision as EventCandidatePayload['temporalPrecision']) ?? 'unknown',
    temporalSource: (input.temporalSource as EventCandidatePayload['temporalSource']) ?? 'message_timestamp',
    eligibilityReason,
    confidence: input.confidence ?? 0.7,
    evidenceIds: input.evidenceIds.length ? input.evidenceIds : ['pipeline'],
  };
  const parsed = eventCandidatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('event_candidate', 'structural_invalid', { issues: parsed.error.issues });
  }
  recordStageCandidate('event_candidate', 'validated');
  return accept('event_candidate', parsed.data);
}

// ─── Memory proposal ────────────────────────────────────────────────────────

export function validateMemoryProposalBeforePersist(input: {
  proposalKind: string;
  subjectEntityId: string;
  predicate: string;
  objectEntityId?: string | null;
  typedValue?: string | null;
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  sensitivity: 'NORMAL' | 'PRIVATE' | 'SENSITIVE';
  evidenceIds: string[];
  temporalScope?: { kind: 'MOMENT' | 'PERIOD' | 'ONGOING' | 'UNKNOWN' };
  proposedMutation: string;
  claimText?: string;
}): StageResult<MemoryProposalPayload> {
  recordStageCandidate('memory_proposal', 'produced');
  const payload = {
    proposalKind: input.proposalKind as MemoryProposalPayload['proposalKind'],
    subjectEntityId: input.subjectEntityId,
    predicate: input.predicate,
    objectEntityId: input.objectEntityId ?? undefined,
    typedValue: input.typedValue ?? undefined,
    confidence: input.confidence,
    risk: input.risk,
    sensitivity: input.sensitivity,
    evidenceIds: input.evidenceIds.length ? input.evidenceIds : ['pipeline'],
    temporalScope: input.temporalScope ?? { kind: 'UNKNOWN' as const },
    proposedMutation: input.proposedMutation,
    claimText: input.claimText,
  };
  const parsed = memoryProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('memory_proposal', 'structural_or_semantic_invalid', {
      issues: parsed.error.issues,
      claimText: input.claimText,
    });
  }
  recordStageCandidate('memory_proposal', 'validated');
  return accept('memory_proposal', parsed.data);
}

// ─── Correction / retraction ────────────────────────────────────────────────

export function validateCorrectionBeforeApply(input: {
  targetClaimIds: string[];
  replacementClaim: string;
  correctionAuthority: CorrectionMutationPayload['correctionAuthority'];
  evidenceIds?: string[];
  note?: string;
  supersessionBehavior: CorrectionMutationPayload['supersessionBehavior'];
}): StageResult<CorrectionMutationPayload> {
  recordStageCandidate('correction_mutation', 'produced');
  const payload = {
    targetClaimIds: input.targetClaimIds,
    replacementClaim: input.replacementClaim,
    correctionAuthority: input.correctionAuthority,
    provenance: {
      evidenceIds: input.evidenceIds,
      note: input.note,
    },
    supersessionBehavior: input.supersessionBehavior,
  };
  const parsed = correctionMutationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('correction_mutation', 'structural_invalid', { issues: parsed.error.issues });
  }
  recordStageCandidate('correction_mutation', 'validated');
  return accept('correction_mutation', parsed.data);
}

export function validateRetractionBeforeApply(input: {
  targetClaimIds: string[];
  reason: string;
  authority: RetractionMutationPayload['retractionAuthority'];
  note?: string;
}): StageResult<RetractionMutationPayload> {
  recordStageCandidate('retraction_mutation', 'produced');
  const payload = {
    targetClaimIds: input.targetClaimIds,
    retractionAuthority: input.authority,
    provenance: { note: input.note },
    reason: input.reason,
  };
  const parsed = retractionMutationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('retraction_mutation', 'structural_invalid', { issues: parsed.error.issues });
  }
  recordStageCandidate('retraction_mutation', 'validated');
  return accept('retraction_mutation', parsed.data);
}

export function recordPersisted(kind: StageCandidateKind): void {
  recordStageCandidate(kind, 'persisted');
}

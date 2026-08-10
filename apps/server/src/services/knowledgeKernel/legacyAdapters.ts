import type { CrystallizedKnowledge } from '../knowledgeCrystallization/types';
import type { PerceptionEntry } from '../perceptionService';

import type {
  AssertionDomain,
  AssertionSensitivity,
  AssertionStatus,
  KnowledgeAssertionInput,
} from './types';

const PERCEPTION_STATUS: Record<PerceptionEntry['status'], AssertionStatus> = {
  unverified: 'proposed',
  confirmed: 'active',
  disproven: 'rejected',
  retracted: 'retracted',
};

const CLAIM_STATUS: Record<CrystallizedKnowledge['status'], AssertionStatus> = {
  PENDING: 'proposed',
  ACTIVE: 'active',
  DORMANT: 'challenged',
  HISTORICAL: 'superseded',
  SUPERSEDED: 'superseded',
};

const CLAIM_DOMAIN: Record<CrystallizedKnowledge['knowledge_type'], AssertionDomain> = {
  behavioral_pattern: 'identity',
  value: 'identity',
  belief: 'world',
  skill: 'skill',
  relationship: 'relationship',
  lesson: 'identity',
  preference: 'preference',
  career: 'career',
  creative: 'identity',
  identity: 'identity',
  health: 'health',
  location: 'location',
};

function claimSensitivity(claim: CrystallizedKnowledge): AssertionSensitivity {
  return claim.knowledge_type === 'health' || claim.knowledge_type === 'relationship'
    ? 'sensitive'
    : 'standard';
}

/**
 * Read adapter only. The legacy perception row remains the source record until
 * kernel dual-write is enabled after schema deployment and parity testing.
 */
export function perceptionToKernelAssertion(
  perception: PerceptionEntry,
): KnowledgeAssertionInput {
  return {
    subject: {
      kind: 'person',
      id: perception.subject_person_id ?? null,
      label: perception.subject_alias,
    },
    predicate: 'perceived_by_user_as',
    objectValue: {
      content: perception.content,
      impactOnUser: perception.impact_on_me,
      source: perception.source,
      sourceDetail: perception.source_detail ?? null,
      sentiment: perception.sentiment ?? null,
      resolutionNote: perception.resolution_note ?? null,
    },
    assertionClass: 'belief',
    domain: 'relationship',
    epistemicStance: 'user_belief',
    assertedBy: { kind: 'user' },
    derivationMethod: 'directly_stated',
    polarity: perception.status === 'disproven' ? 'negated' : 'uncertain',
    certainty: perception.confidence_level,
    status: PERCEPTION_STATUS[perception.status],
    sensitivity: 'sensitive',
    occurredAt: perception.timestamp_heard,
    recordedAt: perception.created_at,
    sourceTable: 'perception_entries',
    sourceId: perception.id,
    metadata: {
      legacyProjection: 'perception_entries',
      originalContent: perception.original_content ?? null,
      evolutionNotes: perception.evolution_notes ?? [],
      createdInHighEmotion: perception.created_in_high_emotion ?? false,
      sourceMetadata: perception.metadata ?? {},
    },
  };
}

/**
 * Read adapter for existing materialized self-knowledge. This preserves that a
 * claim is LoreBook-derived, even when its current evidence has matured enough
 * for the Claims projection to display it as active knowledge.
 */
export function crystallizedKnowledgeToKernelAssertion(
  userId: string,
  claim: CrystallizedKnowledge,
): KnowledgeAssertionInput {
  const active = claim.status === 'ACTIVE';

  return {
    subject: { kind: 'self', id: userId, label: 'You' },
    predicate: claim.machine_claim,
    objectValue: {
      value: true,
      humanReadableClaim: claim.human_readable_claim,
    },
    assertionClass: active ? 'reflection' : 'hypothesis',
    domain: CLAIM_DOMAIN[claim.knowledge_type],
    epistemicStance: active ? 'established_knowledge' : 'system_hypothesis',
    assertedBy: { kind: 'lorebook', label: 'LoreBook' },
    derivationMethod: 'calculated',
    polarity: 'affirmed',
    certainty: claim.confidence,
    status: CLAIM_STATUS[claim.status],
    sensitivity: claimSensitivity(claim),
    validFrom: claim.first_evidenced_at,
    recordedAt: claim.created_at,
    sourceTable: 'crystallized_knowledge',
    sourceId: claim.id,
    metadata: {
      legacyProjection: 'crystallized_knowledge',
      confidenceBreakdown: claim.confidence_breakdown,
      triggerType: claim.trigger_type,
      triggerId: claim.trigger_id,
      lastReinforcedAt: claim.last_reinforced_at,
      supersededById: claim.superseded_by_id,
    },
  };
}

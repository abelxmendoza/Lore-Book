import { fetchJson } from '../lib/api';
import type { PerceptionEntry } from '../types/perception';

import type { EvidenceLink, KnowledgeClaim } from './knowledge';

export type KernelAssertionStatus =
  | 'proposed'
  | 'active'
  | 'challenged'
  | 'superseded'
  | 'retracted'
  | 'rejected';

export type KernelEpistemicStance =
  | 'direct_observation'
  | 'reported_statement'
  | 'user_belief'
  | 'system_hypothesis'
  | 'established_knowledge';

export type KernelActorKind =
  | 'user'
  | 'lorebook'
  | 'external_person'
  | 'document_author'
  | 'imported_source'
  | 'unknown';

export type KernelAssertion = {
  id: string;
  user_id: string;
  subject_kind: string;
  subject_id: string | null;
  subject_label: string;
  predicate: string;
  object_value: unknown;
  assertion_class: string;
  domain: string;
  epistemic_stance: KernelEpistemicStance;
  asserted_by_kind: KernelActorKind;
  asserted_by_id: string | null;
  asserted_by_label: string | null;
  derivation_method: string;
  polarity: 'affirmed' | 'uncertain' | 'negated';
  certainty: number | null;
  status: KernelAssertionStatus;
  sensitivity: 'standard' | 'sensitive' | 'high_impact' | 'restricted';
  valid_from: string | null;
  valid_to: string | null;
  occurred_at: string | null;
  recorded_at: string;
  metadata: Record<string, unknown>;
};

export type KernelEvidenceLink = {
  id: string;
  target_id: string;
  evidence_kind: string;
  evidence_id: string;
  relation: 'supports' | 'challenges' | 'contextualizes' | 'duplicates' | 'irrelevant';
  weight: number;
  excerpt: string | null;
  locator: Record<string, unknown>;
  linked_by: 'user' | 'system' | 'import';
  rationale: string | null;
  extraction_confidence: number | null;
  created_at: string;
};

export type KernelRevisionLink = {
  id: string;
  from_assertion_id: string;
  to_assertion_id: string;
  relation: 'supersedes' | 'corrects' | 'retracts' | 'narrows' | 'expands';
  rationale: string | null;
  created_at: string;
};

export type KnowledgeKernelSummary = {
  total: number;
  needs_review: number;
  challenged: number;
  recently_changed: number;
  by_status: Record<string, number>;
  by_stance: Record<string, number>;
  by_domain: Record<string, number>;
};

export type KernelInspection = {
  assertion: KernelAssertion;
  evidence: KernelEvidenceLink[];
  revisions: KernelRevisionLink[];
  warnings: string[];
};

export type LegacyCharacterFactProjection = {
  id: string;
  category: string;
  fact: string;
  confidence?: number;
  status?: string;
  previous_value?: string;
  mention_count?: number;
  first_seen_at?: string | null;
  last_confirmed_at?: string | null;
  updated_at?: string | null;
};

export type LegacyCharacterClaimProjection = {
  id: string;
  human_readable_claim: string;
  knowledge_type?: string;
  confidence?: number;
  evidence_count?: number;
  evidence_links?: Array<{ evidence_summary?: string }>;
  last_reinforced_at?: string;
};

const CLAIM_STATUS: Record<KnowledgeClaim['status'], KernelAssertionStatus> = {
  PENDING: 'proposed',
  ACTIVE: 'active',
  DORMANT: 'challenged',
  HISTORICAL: 'superseded',
  SUPERSEDED: 'superseded',
};

const PERCEPTION_STATUS: Record<PerceptionEntry['status'], KernelAssertionStatus> = {
  unverified: 'proposed',
  confirmed: 'active',
  disproven: 'rejected',
  retracted: 'retracted',
};

function legacyEvidenceToKernel(link: EvidenceLink): KernelEvidenceLink {
  return {
    id: link.id,
    target_id: link.knowledge_id,
    evidence_kind: link.evidence_type,
    evidence_id: link.evidence_id,
    relation: link.evidence_weight < 0 ? 'challenges' : 'supports',
    weight: Math.abs(link.evidence_weight),
    excerpt: link.evidence_summary,
    locator: { sourceTable: link.evidence_type, sourceId: link.evidence_id },
    linked_by: 'system',
    rationale: null,
    extraction_confidence: null,
    created_at: link.created_at,
  };
}

/**
 * Transitional projection: legacy Claims remain the durable source until the
 * Knowledge Kernel migration and dual-write parity checks are complete.
 */
export function projectClaimForKnowledgeInspector(
  claim: KnowledgeClaim,
): KernelInspection {
  return {
    assertion: {
      id: claim.id,
      user_id: claim.user_id,
      subject_kind: 'self',
      subject_id: claim.user_id,
      subject_label: 'You',
      predicate: claim.machine_claim,
      object_value: {
        humanReadableClaim: claim.human_readable_claim,
      },
      assertion_class: claim.status === 'ACTIVE' ? 'reflection' : 'hypothesis',
      domain: claim.knowledge_type,
      epistemic_stance: claim.status === 'ACTIVE' ? 'established_knowledge' : 'system_hypothesis',
      asserted_by_kind: 'lorebook',
      asserted_by_id: null,
      asserted_by_label: 'LoreBook',
      derivation_method: 'calculated',
      polarity: 'affirmed',
      certainty: claim.confidence,
      status: CLAIM_STATUS[claim.status],
      sensitivity: claim.knowledge_type === 'health' || claim.knowledge_type === 'relationship'
        ? 'sensitive'
        : 'standard',
      valid_from: claim.first_evidenced_at,
      valid_to: null,
      occurred_at: null,
      recorded_at: claim.created_at,
      metadata: {
        legacyProjection: 'crystallized_knowledge',
        lastReinforcedAt: claim.last_reinforced_at,
        confidenceBreakdown: claim.confidence_breakdown,
      },
    },
    evidence: (claim.evidence_links ?? []).map(legacyEvidenceToKernel),
    revisions: (claim.supersedence_chain ?? []).map((previous, index) => ({
      id: `${claim.id}:revision:${index}`,
      from_assertion_id: previous.id,
      to_assertion_id: claim.id,
      relation: 'supersedes',
      rationale: previous.human_readable_claim,
      created_at: previous.created_at,
    })),
    warnings: [],
  };
}

/** Project a user-authored Perception into the same inspector contract. */
export function projectPerceptionForKnowledgeInspector(
  perception: PerceptionEntry,
): KernelInspection {
  const evidence: KernelEvidenceLink[] = [];
  if (perception.related_memory_id) {
    evidence.push({
      id: `${perception.id}:memory`,
      target_id: perception.id,
      evidence_kind: 'journal_entry',
      evidence_id: perception.related_memory_id,
      relation: 'supports',
      weight: 1,
      excerpt: 'A linked memory was recorded with this belief.',
      locator: { sourceTable: 'journal_entries', sourceId: perception.related_memory_id },
      linked_by: 'user',
      rationale: null,
      extraction_confidence: 1,
      created_at: perception.created_at,
    });
  }
  if (perception.source_detail) {
    evidence.push({
      id: `${perception.id}:source-context`,
      target_id: perception.id,
      evidence_kind: perception.source,
      evidence_id: perception.id,
      relation: 'contextualizes',
      weight: 0,
      excerpt: perception.source_detail,
      locator: { sourceTable: 'perception_entries', sourceId: perception.id },
      linked_by: 'user',
      rationale: 'The source description recorded with this belief.',
      extraction_confidence: null,
      created_at: perception.created_at,
    });
  }

  return {
    assertion: {
      id: perception.id,
      user_id: perception.user_id,
      subject_kind: 'person',
      subject_id: perception.subject_person_id ?? null,
      subject_label: perception.subject_alias,
      predicate: 'perceived_by_user_as',
      object_value: { humanReadableClaim: perception.content },
      assertion_class: 'belief',
      domain: 'relationship',
      epistemic_stance: 'user_belief',
      asserted_by_kind: 'user',
      asserted_by_id: null,
      asserted_by_label: null,
      derivation_method: 'directly_stated',
      polarity: perception.status === 'disproven' ? 'negated' : 'uncertain',
      certainty: perception.confidence_level,
      status: PERCEPTION_STATUS[perception.status],
      sensitivity: 'sensitive',
      valid_from: null,
      valid_to: null,
      occurred_at: perception.timestamp_heard,
      recorded_at: perception.created_at,
      metadata: {
        legacyProjection: 'perception_entries',
        impactOnUser: perception.impact_on_me,
        originalContent: perception.original_content ?? null,
        resolutionNote: perception.resolution_note ?? null,
        evolutionNotes: perception.evolution_notes ?? [],
        source: perception.source,
        sourceDetail: perception.source_detail ?? null,
      },
    },
    evidence,
    revisions: [],
    warnings: evidence.length === 0
      ? ['No source record or linked memory has been attached to this belief yet.']
      : [],
  };
}

/**
 * Read-only bridge for Character Book facts. A mention count is not presented
 * as evidence because the legacy response does not include source locators.
 */
export function projectCharacterFactForKnowledgeInspector(input: {
  characterId: string;
  characterName: string;
  fact: LegacyCharacterFactProjection;
}): KernelInspection {
  const { characterId, characterName, fact } = input;
  const knownRecordedAt = fact.updated_at ?? fact.last_confirmed_at ?? fact.first_seen_at;
  const recordedAt = knownRecordedAt ?? new Date(0).toISOString();
  return {
    assertion: {
      id: fact.id,
      user_id: '',
      subject_kind: 'character',
      subject_id: characterId,
      subject_label: characterName,
      predicate: fact.category || 'has_recorded_fact',
      object_value: { humanReadableClaim: fact.fact },
      assertion_class: 'statement',
      domain: fact.category || 'general',
      epistemic_stance: 'reported_statement',
      asserted_by_kind: 'user',
      asserted_by_id: null,
      asserted_by_label: null,
      derivation_method: 'extracted',
      polarity: fact.status === 'contradicted' ? 'uncertain' : 'affirmed',
      certainty: fact.confidence ?? null,
      status: fact.status === 'contradicted' ? 'challenged' : 'active',
      sensitivity: 'standard',
      valid_from: fact.first_seen_at ?? null,
      valid_to: null,
      occurred_at: null,
      recorded_at: recordedAt,
      metadata: {
        legacyProjection: 'character_facts',
        originalContent: fact.previous_value ?? null,
        mentionCount: fact.mention_count ?? null,
        recordedDateUnknown: !knownRecordedAt,
      },
    },
    evidence: [],
    revisions: [],
    warnings: [
      'This older fact record does not include source passages yet. LoreBook is showing its certainty and history without pretending the mention count is evidence.',
    ],
  };
}

/** Read-only bridge for character-specific crystallized knowledge. */
export function projectCharacterClaimForKnowledgeInspector(input: {
  characterId: string;
  characterName: string;
  claim: LegacyCharacterClaimProjection;
}): KernelInspection {
  const { characterId, characterName, claim } = input;
  const recordedAt = claim.last_reinforced_at ?? new Date(0).toISOString();
  const evidence = (claim.evidence_links ?? [])
    .filter((link) => Boolean(link.evidence_summary?.trim()))
    .map((link, index): KernelEvidenceLink => ({
      id: `${claim.id}:legacy-evidence:${index}`,
      target_id: claim.id,
      evidence_kind: 'legacy_knowledge_evidence',
      evidence_id: `${claim.id}:source:${index}`,
      relation: 'supports',
      weight: 1,
      excerpt: link.evidence_summary!.trim(),
      locator: { legacyProjection: 'character_knowledge_claim' },
      linked_by: 'system',
      rationale: null,
      extraction_confidence: null,
      created_at: recordedAt,
    }));

  return {
    assertion: {
      id: claim.id,
      user_id: '',
      subject_kind: 'character',
      subject_id: characterId,
      subject_label: characterName,
      predicate: 'has_inferred_pattern',
      object_value: { humanReadableClaim: claim.human_readable_claim },
      assertion_class: 'hypothesis',
      domain: claim.knowledge_type ?? 'relationship',
      epistemic_stance: 'system_hypothesis',
      asserted_by_kind: 'lorebook',
      asserted_by_id: null,
      asserted_by_label: 'LoreBook',
      derivation_method: 'inferred',
      polarity: 'uncertain',
      certainty: claim.confidence ?? null,
      status: 'proposed',
      sensitivity: claim.knowledge_type === 'health' || claim.knowledge_type === 'relationship'
        ? 'sensitive'
        : 'standard',
      valid_from: null,
      valid_to: null,
      occurred_at: null,
      recorded_at: recordedAt,
      metadata: {
        legacyProjection: 'character_knowledge_claim',
        recordedDateUnknown: !claim.last_reinforced_at,
      },
    },
    evidence,
    revisions: [],
    warnings: evidence.length === 0
      ? ['This pattern does not have source passages attached in the Character Book response yet.']
      : [],
  };
}

export const knowledgeKernelApi = {
  getSummary: () => fetchJson<{ success: true; summary: KnowledgeKernelSummary }>(
    '/api/knowledge-kernel/summary',
  ),

  getAssertions: (filters?: {
    status?: KernelAssertionStatus;
    stance?: KernelEpistemicStance;
    domain?: string;
    subject_kind?: string;
    subject_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value != null) params.set(key, String(value));
    }
    const query = params.toString();
    return fetchJson<{ success: true; assertions: KernelAssertion[]; total: number }>(
      `/api/knowledge-kernel/assertions${query ? `?${query}` : ''}`,
    );
  },

  getAssertion: (id: string) => fetchJson<{
    success: true;
    assertion: KernelAssertion;
    evidence: KernelEvidenceLink[];
    revisions: KernelRevisionLink[];
    derivations: unknown[];
    warnings: string[];
  }>(`/api/knowledge-kernel/assertions/${id}`),

  getSubjectAssertions: (kind: string, id: string) => fetchJson<{
    success: true;
    assertions: KernelAssertion[];
    total: number;
  }>(`/api/knowledge-kernel/subjects/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`),
};

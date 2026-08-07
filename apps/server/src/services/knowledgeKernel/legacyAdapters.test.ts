import { describe, expect, it } from 'vitest';

import type { CrystallizedKnowledge } from '../knowledgeCrystallization/types';
import type { PerceptionEntry } from '../perceptionService';

import {
  crystallizedKnowledgeToKernelAssertion,
  perceptionToKernelAssertion,
} from './legacyAdapters';

const perception: PerceptionEntry = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  subject_person_id: '00000000-0000-4000-8000-000000000003',
  subject_alias: 'Jamie',
  content: 'I thought Jamie might leave the project.',
  source: 'told_by',
  source_detail: 'A teammate mentioned it.',
  confidence_level: 0.4,
  sentiment: 'neutral',
  timestamp_heard: '2026-07-01T00:00:00.000Z',
  impact_on_me: 'I prepared a backup plan.',
  status: 'unverified',
  retracted: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

const claim: CrystallizedKnowledge = {
  id: '00000000-0000-4000-8000-000000000004',
  user_id: '00000000-0000-4000-8000-000000000002',
  machine_claim: 'returns_to_creative_work',
  human_readable_claim: 'You repeatedly return to creative work after setbacks.',
  knowledge_type: 'creative',
  status: 'ACTIVE',
  superseded_by_id: null,
  crystallize_after: null,
  confidence: 0.82,
  confidence_breakdown: {
    base_evidence: 0.8,
    temporal_stability: 0.8,
    cross_context: 0.7,
    recency_factor: 0.9,
    contradiction_penalty: 0,
    final: 0.82,
    computed_at: '2026-07-03T00:00:00.000Z',
  },
  trigger_type: 'pattern_threshold',
  trigger_id: null,
  first_evidenced_at: '2025-01-01T00:00:00.000Z',
  last_reinforced_at: '2026-07-02T00:00:00.000Z',
  principle_eligible: true,
  biography_eligible: true,
  arc_close_eligible: false,
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
};

describe('knowledge kernel legacy adapters', () => {
  it('projects a perception as a proposed user belief', () => {
    const assertion = perceptionToKernelAssertion(perception);

    expect(assertion).toMatchObject({
      predicate: 'perceived_by_user_as',
      assertionClass: 'belief',
      epistemicStance: 'user_belief',
      status: 'proposed',
      sourceTable: 'perception_entries',
    });
    expect(assertion.objectValue).toMatchObject({
      content: perception.content,
      impactOnUser: perception.impact_on_me,
    });
  });

  it('preserves disproven perceptions as rejected, negated assertions', () => {
    const assertion = perceptionToKernelAssertion({
      ...perception,
      status: 'disproven',
    });

    expect(assertion.status).toBe('rejected');
    expect(assertion.polarity).toBe('negated');
  });

  it('projects active crystallized knowledge without hiding LoreBook authorship', () => {
    const assertion = crystallizedKnowledgeToKernelAssertion(claim.user_id, claim);

    expect(assertion).toMatchObject({
      predicate: 'returns_to_creative_work',
      assertionClass: 'reflection',
      epistemicStance: 'established_knowledge',
      assertedBy: { kind: 'lorebook', label: 'LoreBook' },
      status: 'active',
      sourceTable: 'crystallized_knowledge',
    });
  });

  it('keeps pending crystallized knowledge as a proposed system hypothesis', () => {
    const assertion = crystallizedKnowledgeToKernelAssertion(claim.user_id, {
      ...claim,
      status: 'PENDING',
    });

    expect(assertion.assertionClass).toBe('hypothesis');
    expect(assertion.epistemicStance).toBe('system_hypothesis');
    expect(assertion.status).toBe('proposed');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  projectClaimForKnowledgeInspector,
  projectCharacterFactForKnowledgeInspector,
  type KernelAssertion,
} from '../../api/knowledgeKernel';

import { AssertionAuthorBadge } from './AssertionAuthorBadge';
import { EpistemicStatusBadge } from './EpistemicStatusBadge';
import { EvidenceBalance } from './EvidenceBalance';
import { KnowledgeInspector } from './KnowledgeInspector';

const assertion: KernelAssertion = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  subject_kind: 'project',
  subject_id: '00000000-0000-4000-8000-000000000003',
  subject_label: 'MemoVault',
  predicate: 'has_status',
  object_value: 'active',
  assertion_class: 'observation',
  domain: 'project',
  epistemic_stance: 'direct_observation',
  asserted_by_kind: 'user',
  asserted_by_id: null,
  asserted_by_label: null,
  derivation_method: 'directly_stated',
  polarity: 'affirmed',
  certainty: 0.8,
  status: 'active',
  sensitivity: 'standard',
  valid_from: null,
  valid_to: null,
  occurred_at: null,
  recorded_at: '2026-08-01T00:00:00.000Z',
  metadata: {},
};

describe('shared epistemic UI', () => {
  it('translates internal lifecycle states into user-facing labels', () => {
    render(<EpistemicStatusBadge status="PENDING" />);
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('keeps user belief and LoreBook authorship explicit', () => {
    render(
      <>
        <AssertionAuthorBadge actorKind="user" stance="user_belief" />
        <AssertionAuthorBadge actorKind="lorebook" stance="system_hypothesis" />
      </>,
    );
    expect(screen.getByText('You believed')).toBeInTheDocument();
    expect(screen.getByText('LoreBook suggests')).toBeInTheDocument();
  });

  it('shows evidence balance without turning missing links into no evidence', () => {
    const { rerender } = render(<EvidenceBalance unknown />);
    expect(screen.getByText('Evidence available in inspector')).toBeInTheDocument();

    rerender(<EvidenceBalance supporting={3} challenging={1} contextual={2} />);
    expect(screen.getByText('3 supporting')).toBeInTheDocument();
    expect(screen.getByText('1 challenging')).toBeInTheDocument();
  });

  it('opens evidence and evolution views in the shared inspector', () => {
    const onClose = vi.fn();
    render(
      <KnowledgeInspector
        open
        onClose={onClose}
        assertion={assertion}
        evidence={[{
          id: 'evidence-1',
          target_id: assertion.id,
          evidence_kind: 'conversation_message',
          evidence_id: '00000000-0000-4000-8000-000000000004',
          relation: 'supports',
          weight: 0.9,
          excerpt: 'The project is active.',
          locator: {},
          linked_by: 'user',
          rationale: null,
          extraction_confidence: 1,
          created_at: '2026-08-01T00:00:00.000Z',
        }]}
      />,
    );

    expect(screen.getByText('MemoVault has status active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.getByText('The project is active.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Evolution' }));
    expect(screen.getByText('No revisions recorded yet.')).toBeInTheDocument();
  });

  it('projects legacy claim evidence without flattening contradictions', () => {
    const inspection = projectClaimForKnowledgeInspector({
      id: 'claim-1',
      user_id: 'synthetic-user',
      machine_claim: 'protects_creative_time',
      human_readable_claim: 'You protect time for creative work.',
      knowledge_type: 'creative',
      status: 'ACTIVE',
      confidence: 0.75,
      confidence_breakdown: {
        base_evidence: 0.7,
        temporal_stability: 0.7,
        cross_context: 0.6,
        recency_factor: 0.8,
        contradiction_penalty: 0.2,
        computed_at: '2026-08-01T00:00:00.000Z',
      },
      trigger_type: 'pattern_threshold',
      first_evidenced_at: '2026-01-01T00:00:00.000Z',
      last_reinforced_at: '2026-08-01T00:00:00.000Z',
      superseded_by_id: null,
      evidence_links: [{
        id: 'counter-evidence-1',
        knowledge_id: 'claim-1',
        user_id: 'synthetic-user',
        evidence_type: 'correction',
        evidence_id: 'correction-1',
        evidence_weight: -0.4,
        evidence_summary: 'A correction challenged the pattern.',
        created_at: '2026-08-01T00:00:00.000Z',
      }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    });

    expect(inspection.assertion.asserted_by_kind).toBe('lorebook');
    expect(inspection.evidence[0]).toMatchObject({
      relation: 'challenges',
      evidence_id: 'correction-1',
    });
  });

  it('does not convert a character fact mention count into source evidence', () => {
    const inspection = projectCharacterFactForKnowledgeInspector({
      characterId: 'character-1',
      characterName: 'Marcus',
      fact: {
        id: 'fact-1',
        category: 'career',
        fact: 'Marcus works in robotics.',
        confidence: 0.8,
        mention_count: 4,
        updated_at: '2026-08-01T00:00:00.000Z',
      },
    });

    expect(inspection.assertion.epistemic_stance).toBe('reported_statement');
    expect(inspection.evidence).toEqual([]);
    expect(inspection.warnings[0]).toContain('does not include source passages');
  });
});

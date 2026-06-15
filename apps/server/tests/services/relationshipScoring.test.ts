import { describe, expect, it } from 'vitest';
import { computeSignals, type RelationshipEvidence } from '../../src/services/conversationCentered/romanticRelationshipScoring';

describe('relationshipScoringService', () => {
  const base: RelationshipEvidence = {
    status: 'active',
    relationshipType: 'dating',
    isCurrent: true,
    isSituationship: false,
    mentionCount: 0,
    lastMentionMs: null,
    interactionSentiments: [],
    conflictCount: 0,
    dateCount: 0,
    mentionConcentration: 0,
  };

  it('differentiates active positive vs ghosted', () => {
    const healthy = computeSignals({
      ...base,
      mentionCount: 20,
      lastMentionMs: Date.now() - 2 * 24 * 60 * 60 * 1000,
      interactionSentiments: [0.8, 0.7, 0.6],
      dateCount: 4,
      mentionConcentration: 0.8,
      loveReciprocated: true,
    });

    const ghosted = computeSignals({
      ...base,
      status: 'ghosted',
      mentionCount: 5,
      lastMentionMs: Date.now() - 200 * 24 * 60 * 60 * 1000,
      interactionSentiments: [-0.3],
      mentionConcentration: 0.2,
    });

    expect(healthy.affection_score).not.toBe(0.5);
    expect(ghosted.red_flags).toContain('Ghosted');
    expect(healthy.affection_score).toBeGreaterThan(ghosted.affection_score);
  });

  it('produces flags deterministically', () => {
    const s = computeSignals({
      ...base,
      mentionCount: 30,
      lastMentionMs: Date.now(),
      interactionSentiments: [0.9, 0.8, 0.7, 0.6],
      dateCount: 5,
      startMs: Date.now() - 400 * 24 * 60 * 60 * 1000,
    });
    expect(s.green_flags.length).toBeGreaterThan(0);
    expect(s.evidence_strength).toBeGreaterThan(0.25);
  });
});

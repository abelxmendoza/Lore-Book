import { describe, expect, it } from 'vitest';

import { canAutoApproveProposal, evaluateProposalIntegrity } from './memoryProposalPolicy';

const evaluate = (claim: string, sourceText = claim, metadata: Record<string, unknown> = {}) =>
  evaluateProposalIntegrity({
    userId: 'user-1',
    entityId: 'entity-1',
    entityName: 'Abel',
    proposal: { entity_id: 'entity-1', claim_text: claim, confidence: 0.9 },
    sourceText,
    metadata: { subject_name: 'Abel', ...metadata },
  });

describe('memoryProposalPolicy', () => {
  it.each([
    ['hi testing the new chat', 'test_debug_or_ui_feedback'],
    ['who am i?', 'question_or_recall_request'],
    ['show me the new chat bubble styling', 'command_or_metaconversation'],
    ['User mentioned a travel event', 'generic_or_incomplete_proposal'],
    ['User has a romantic partner relationship', 'generic_or_incomplete_proposal'],
  ])('rejects queue garbage: %s', (text, reason) => {
    expect(evaluate(text)).toMatchObject({ valid: false, rejectionReason: reason });
  });

  it('rejects an unresolved relationship endpoint', () => {
    expect(evaluate('Abel met her at the afters')).toMatchObject({
      valid: false,
      rejectionReason: 'unresolved_relationship_endpoint',
    });
  });

  it('rejects recall questions even when they mention an event', () => {
    expect(evaluate('Did I go to the party last night?')).toMatchObject({
      valid: false,
      rejectionReason: 'question_or_recall_request',
    });
  });

  it('does not treat a temporal word as an entity', () => {
    expect(evaluate('tonight', 'tonight', { entity_name: 'tonight' })).toMatchObject({
      valid: false,
      rejectionReason: 'incomplete_fragment',
    });
  });

  it('rejects a temporal word joined as a PERSON entity', () => {
    const result = evaluateProposalIntegrity({
      userId: 'user-1',
      entityId: 'tonight-person',
      entityName: 'tonight',
      proposal: { entity_id: 'tonight-person', claim_text: 'A plan was mentioned for later', confidence: 0.9 },
      sourceText: 'A plan was mentioned for later',
    });
    expect(result).toMatchObject({ valid: false, rejectionReason: 'invalid_temporal_entity' });
  });

  it('separates confidence, risk, and sensitivity', () => {
    const place = evaluate('Catch One is a club');
    expect(place).toMatchObject({ valid: true, proposalKind: 'entity_classification', riskLevel: 'LOW', sensitivity: 'NORMAL' });
    expect(canAutoApproveProposal(place)).toBe(true);

    const relationship = evaluate('Sol blocked Abel on Instagram');
    expect(relationship).toMatchObject({ valid: true, proposalKind: 'relationship', riskLevel: 'HIGH', sensitivity: 'PRIVATE' });
    expect(canAutoApproveProposal(relationship)).toBe(false);
  });

  it('creates a correction mutation instead of a second additive fact', () => {
    expect(evaluate("I'm not a DJ actually—that's a mistake")).toMatchObject({
      valid: true,
      proposalKind: 'retraction',
      riskLevel: 'HIGH',
      normalizedSummary: "Abel is not a DJ actually—that's a mistake",
    });
    expect(evaluate("I'm not a DJ actually—that's a mistake").proposedMutation).toMatch(/Supersede/i);
  });

  it('assigns stable fingerprints to the same normalized belief', () => {
    expect(evaluate('Catch One is a club').fingerprint).toBe(evaluate('Catch One is a club').fingerprint);
    expect(evaluate('Catch One is a club').fingerprint).not.toBe(evaluate('Ex Lover is a band').fingerprint);
  });

  it('keeps event, plan, feeling, and occupation distinct', () => {
    expect(evaluate('Abel attended Bar Sinister').proposalKind).toBe('event');
    expect(evaluate('Abel is planning to go clubbing tonight').proposalKind).toBe('plan');
    expect(evaluate('Abel felt optimistic about the project').proposalKind).toBe('emotional_state');
    expect(evaluate('Abel works as a Quality Assurance Technician').proposalKind).toBe('occupation');
  });

  it('stabilizes temporal JSON key order without merging different dates', () => {
    const base = {
      userId: 'user-1', entityId: 'entity-1', entityName: 'Abel', sourceText: 'Abel attended the party',
    };
    const first = evaluateProposalIntegrity({
      ...base,
      proposal: { entity_id: 'entity-1', claim_text: 'Abel attended the party', confidence: 0.9, temporal_context: { date: '2026-07-04', precision: 'day' } },
      metadata: { message_id: 'message-1' },
    });
    const reordered = evaluateProposalIntegrity({
      ...base,
      proposal: { entity_id: 'entity-1', claim_text: 'Abel attended the party', confidence: 0.9, temporal_context: { precision: 'day', date: '2026-07-04' } },
      metadata: { message_id: 'message-1' },
    });
    const later = evaluateProposalIntegrity({
      ...base,
      proposal: { entity_id: 'entity-1', claim_text: 'Abel attended the party', confidence: 0.9, temporal_context: { date: '2026-07-05', precision: 'day' } },
      metadata: { message_id: 'message-2' },
    });
    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(first.fingerprint).not.toBe(later.fingerprint);
  });

  it('keeps separate event occurrences apart while merging a replay of one message', () => {
    const event = (messageId: string) => evaluateProposalIntegrity({
      userId: 'user-1', entityId: 'entity-1', entityName: 'Abel',
      proposal: { entity_id: 'entity-1', claim_text: 'Abel attended a LoreBook milestone', confidence: 0.9 },
      sourceText: 'Abel attended a LoreBook milestone',
      metadata: { message_id: messageId },
    });
    expect(event('message-1').fingerprint).toBe(event('message-1').fingerprint);
    expect(event('message-1').fingerprint).not.toBe(event('message-2').fingerprint);
  });

  it('merges a self-correction even when legacy extraction attached it to different entities', () => {
    const correction = (entityId: string) => evaluateProposalIntegrity({
      userId: 'user-1', entityId, entityName: 'Wrong object',
      proposal: { entity_id: entityId, claim_text: "I'm not a DJ", confidence: 0.9 },
      sourceText: "I'm not a DJ",
      metadata: { subject_name: 'Abel' },
    });
    expect(correction('amazon').fingerprint).toBe(correction('cousin').fingerprint);
    expect(correction('amazon').fingerprintInputs).toMatchObject({
      subjectScope: 'self',
      entityScope: 'user:user-1',
    });
  });

  it('does not merge plans, completed events, feelings, relationship changes, or milestones', () => {
    const fingerprint = (claim: string, messageId: string) => evaluateProposalIntegrity({
      userId: 'user-1', entityId: 'sol', entityName: 'Sol',
      proposal: { entity_id: 'sol', claim_text: claim, confidence: 0.9 },
      sourceText: claim,
      metadata: { message_id: messageId, subject_name: 'Abel' },
    }).fingerprint;

    expect(fingerprint('Abel is planning to attend a party', 'm1'))
      .not.toBe(fingerprint('Abel attended a party', 'm2'));
    expect(fingerprint('Abel felt excited after the party', 'm3'))
      .not.toBe(fingerprint('Abel attended the party', 'm3'));
    expect(fingerprint('Sol blocked Abel on Instagram', 'm4'))
      .not.toBe(fingerprint('Sol later texted Abel', 'm5'));
    expect(fingerprint('Abel completed the LoreBook review queue', 'm6'))
      .not.toBe(fingerprint('Abel launched the LoreBook timeline', 'm7'));
  });

  it('rejects mixed correction and occupation compounds for atomic splitting upstream', () => {
    expect(evaluate("I'm not a DJ and I'm currently working at Amazon as a QA technician")).toMatchObject({
      valid: false,
      rejectionReason: 'compound_mixed_proposal',
    });
  });
});

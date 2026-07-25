import { describe, expect, it } from 'vitest';

import { beliefCognitionEngine } from './beliefCognitionEngine';
import type { BeliefCognitionInput } from './beliefTypes';

const USER = 'user-synthetic-1';
const NOW = new Date('2026-07-23T18:00:00.000Z');

function evaluate(
  sourceText: string,
  overrides: Partial<BeliefCognitionInput> = {},
) {
  return beliefCognitionEngine.evaluate({
    userId: USER,
    userDisplayName: 'Marcus',
    claimText: overrides.claimText ?? sourceText,
    sourceText,
    now: NOW,
    ...overrides,
  });
}

describe('Belief Cognition Engine', () => {
  it.each([
    ['try again', 'COMMAND'],
    ['that question doesn\'t make sense for what I said', 'SYSTEM_FEEDBACK'],
    ['bro those sources don\'t even relate to what i just said', 'SYSTEM_FEEDBACK'],
    ['what if i upload photos and tell you like that can you document it', 'QUESTION'],
    ['Imagine you are introducing me to someone who has never met me.', 'ROLEPLAY'],
  ])('rejects conversational noise: %s', (text, speechAct) => {
    const result = evaluate(text);
    expect(result.speechAct).toBe(speechAct);
    expect(result.decision).toBe('REJECT');
    expect(result.eligibility.eligible).toBe(false);
    expect(result.proposition.confidenceBreakdown.overallEligibilityConfidence).toBe(0);
  });

  it('accepts durable autobiographical facts', () => {
    const result = evaluate('I live in Anaheim.');
    expect(result.speechAct).toBe('AUTOBIOGRAPHICAL_ASSERTION');
    expect(result.proposition.domain).toBe('RESIDENCE');
    expect(result.routingTarget).toBe('TRUTH_STATE');
    expect(result.proposition.subject.displayName).toBe('Marcus');
    expect(result.decision).not.toBe('REJECT');
  });

  it('resolves first-person emotion and ignores story-group subject', () => {
    const result = evaluate('yeah i\'m stoked', {
      storyGroupLabel: 'Cousin',
      entityName: 'Cousin',
      claimText: 'Cousin is stoked.',
    });
    expect(result.proposition.subject.displayName).toBe('Marcus');
    expect(result.proposition.subject.displayName).not.toBe('Cousin');
    expect(result.proposition.domain).toBe('EMOTIONAL_STATE');
    expect(result.routingTarget).toBe('TEMPORAL_STATE');
    expect(result.diagnostic.rejectedSubjectCandidates.some((c) => c.label === 'Cousin')).toBe(true);
  });

  it('keeps story group as metadata for Costco trip', () => {
    const result = evaluate('I went to Costco with Abuela.', {
      storyGroupLabel: "Abuela's House",
      entityName: "Abuela's House",
    });
    expect(result.proposition.subject.displayName).toBe('Marcus');
    expect(result.proposition.subject.displayName).not.toMatch(/House/i);
    expect(result.routingTarget).toBe('EVENT');
    expect(result.proposition.durability).toBe('EVENT_ONLY');
  });

  it('routes past events out of durable truth', () => {
    const result = evaluate('Yesterday I stayed home and built MemoVault.');
    expect(result.proposition.domain).toBe('EVENT');
    expect(result.routingTarget).toBe('EVENT');
    expect(result.mutationPlan.mutation).toBe('ROUTE_TO_EVENT');
  });

  it('compiles durable creator identity into truth state', () => {
    const result = evaluate('I am the creator of MemoVault.');
    expect(result.routingTarget).toBe('TRUTH_STATE');
    expect(result.proposition.subject.displayName).toBe('Marcus');
    expect(result.proposition.predicate).toMatch(/creat/i);
    expect(result.proposition.renderedText).toMatch(/Marcus/i);
    expect(result.proposition.renderedText).toMatch(/MemoVault/i);
  });

  it('bounds temporary location states', () => {
    const result = evaluate('I\'m at Chipotle now.');
    expect(result.routingTarget).toBe('TEMPORAL_STATE');
    expect(result.proposition.temporalScope?.validUntil).toBeTruthy();
    expect(result.proposition.durability).toBe('TEMPORARY_STATE');
  });

  it('routes product goals out of identity beliefs', () => {
    const result = evaluate('I want MemoVault to launch and make monthly revenue.');
    expect(result.proposition.domain).toBe('PROJECT_GOAL');
    expect(result.routingTarget).toBe('PROJECT_GOAL');
    expect(result.mutationPlan.mutation).toBe('ROUTE_TO_PROJECT');
  });

  it('rejects therapy diagnosis claims as durable beliefs', () => {
    const result = evaluate('Marcus needs a therapist.');
    expect(result.decision).toBe('REJECT');
    expect(result.diagnostic.warnings).toContain('unsafe_therapy_diagnosis_claim');
  });

  it('rejects UI preferences as autobiographical truth', () => {
    const result = evaluate('Make the bubble glow with a neon gradient.');
    expect(['UI_FEEDBACK', 'PRODUCT_FEEDBACK', 'REQUEST', 'COMMAND']).toContain(result.speechAct);
    expect(result.decision).toBe('REJECT');
  });

  it('preserves allegation attribution', () => {
    const result = evaluate('People online said I was sexually aggressive.');
    expect(result.proposition.domain).toBe('ALLEGATION');
    expect(result.proposition.modality).toBe('ALLEGED');
    expect(result.proposition.attribution?.status).toBe('ALLEGATION');
    expect(result.proposition.renderedText.toLowerCase()).toContain('accused');
    expect(result.proposition.renderedText.toLowerCase()).not.toMatch(/^marcus is sexually aggressive/);
    expect(result.sensitivity).toEqual(expect.arrayContaining(['SEXUAL', 'REPUTATIONAL']));
  });

  it('keeps user admissions distinct from allegations', () => {
    const result = evaluate('I put my arm around her after she told me no.');
    expect(result.proposition.attribution?.status).toBe('DIRECT_ASSERTION');
    expect(result.proposition.domain).not.toBe('ALLEGATION');
    expect(result.sensitivity).toEqual(expect.arrayContaining(['SEXUAL']));
  });

  it('supersedes when a retraction target exists', () => {
    const result = evaluate('I\'m not a DJ actually.', {
      existingClaimTexts: [{ id: 'claim-dj', text: 'Marcus is a DJ.' }],
    });
    expect(result.speechAct).toBe('RETRACTION');
    expect(result.decision).toBe('SUPERSEDE');
    expect(result.correctionTarget.selectedBeliefId).toBe('claim-dj');
    expect(result.mutationPlan.mutation).toBe('SUPERSEDE');
  });

  it('creates a negative constraint when retraction target is missing', () => {
    const result = evaluate('I\'m not dating Jamie.');
    expect(result.speechAct).toBe('RETRACTION');
    expect(result.decision).toBe('ADD_NEGATIVE_CONSTRAINT');
    expect(result.correctionTarget.matchMethod).toBe('UNRESOLVED');
    expect(result.confirmationRequirement).toBe('BLOCK_UNTIL_CONFIRMED');
  });

  it('collapses same-evidence duplicates', () => {
    const first = evaluate('Jamie blocked me on Instagram.', {
      evidenceIds: ['ev-1'],
    });
    const second = evaluate('Jamie blocked me on Instagram.', {
      evidenceIds: ['ev-1'],
      existingClaimTexts: [{ id: 'p1', text: first.proposition.renderedText }],
    });
    expect(second.duplicateDecision).toMatch(/DUPLICATE|ENTAILS/);
    expect(second.decision).toBe('ADD_EVIDENCE');
  });

  it('treats semantic residence duplicates as add-evidence', () => {
    const result = evaluate('I live in Anaheim.', {
      existingClaimTexts: [{ id: 'c1', text: 'Marcus lives in Anaheim.' }],
    });
    expect(result.duplicateDecision).not.toBe('NOT_DUPLICATE');
    expect(result.decision).toBe('ADD_EVIDENCE');
  });

  it('keeps plans as plans', () => {
    const result = evaluate('I\'m going clubbing tonight.');
    expect(result.proposition.domain).toBe('PLAN');
    expect(result.proposition.durability).toBe('PLAN_ONLY');
    expect(result.routingTarget).toBe('PLAN');
  });

  it('compiles clean propositions from malformed grammar', () => {
    const result = evaluate('I was build MemoVault at my tia Grace\'s house.');
    expect(result.proposition.renderedText).toMatch(/Marcus/i);
    expect(result.proposition.renderedText).toMatch(/MemoVault|worked on/i);
    expect(result.proposition.sourceQuote).toMatch(/was build/i);
  });

  it('allows explicit organization subjects when the sentence says so', () => {
    const result = evaluate('Vanguard Robotics is my new employer.', {
      entityName: 'Vanguard Robotics',
      entityId: 'org-vanguard',
      claimText: 'Vanguard Robotics is my new employer.',
    });
    expect(result.proposition.subject.displayName).toBe('Vanguard Robotics');
    expect(result.proposition.subject.entityType).toBe('ORGANIZATION');
  });
});

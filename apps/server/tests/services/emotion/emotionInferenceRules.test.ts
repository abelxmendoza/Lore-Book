import { describe, it, expect } from 'vitest';

import { emotionInferenceService } from '../../../src/services/emotion/inference/emotionInferenceService';
import {
  hasProvenance,
  requiresSensitiveReview,
  shouldCreateEmotionBookCard,
} from '../../../src/services/emotion/inference/emotionProvenanceService';
import { appendArcPhase } from '../../../src/services/emotion/inference/emotionalArcInferenceService';
import { STANDALONE_EMOTION_LABELS } from '../../../src/services/emotion/inference/emotionInferenceTypes';

function infer(text: string, extra: Parameters<typeof emotionInferenceService.inferFromMessage>[0] = {}) {
  return emotionInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findSignal(result: ReturnType<typeof infer>, emotionType: string) {
  return result.accepted.find((s) => s.emotionType === emotionType);
}

describe('emotion inference rules', () => {
  it('explicit felt rejected attaches to event/person', () => {
    const result = infer('After Ska Prom I felt rejected when Sol stopped texting.');
    const signal = findSignal(result, 'rejection');
    expect(signal).toBeDefined();
    expect(signal!.attachedTo.inferredTitle).toMatch(/Sol|Ska Prom/i);
    expect(signal!.attachedTo.entityType).toMatch(/person|event|relationship/);
  });

  it('ghosted me infers rejection/hurt', () => {
    const result = infer('Sol ghosted me after prom and I still think about it.');
    expect(findSignal(result, 'rejection')).toBeDefined();
    expect(findSignal(result, 'sadness')).toBeDefined();
    expect(result.accepted.some((s) => /Sol/i.test(s.attachedTo.inferredTitle ?? ''))).toBe(true);
  });

  it('people wanted to jump me infers fear/threat', () => {
    const result = infer('At the party people wanted to jump me so I got the homie out.');
    expect(findSignal(result, 'fear')).toBeDefined();
    expect(findSignal(result, 'anxiety')).toBeDefined();
    expect(result.accepted.some((s) => s.requiresReview)).toBe(true);
  });

  it('got offer infers pride/relief', () => {
    const result = infer('I got offer from Amazon today and I\'m proud.');
    expect(findSignal(result, 'pride')).toBeDefined();
    expect(findSignal(result, 'relief')).toBeDefined();
    expect(result.accepted.some((s) => /Amazon/i.test(s.attachedTo.inferredTitle ?? ''))).toBe(true);
  });

  it('never had friends like him infers nostalgia/significance', () => {
    const result = infer('I never had friends like him — Bryan was my best friend.');
    expect(findSignal(result, 'nostalgia')).toBeDefined();
    expect(result.significance.some((s) => s.significanceType === 'meaningful_bond')).toBe(true);
  });

  it('mixed emotion splits into multiple attachments', () => {
    const result = infer(
      'I was excited about Amazon but mad my Abuela made me late.',
    );
    const excitement = findSignal(result, 'excitement');
    const anger = findSignal(result, 'anger');
    expect(excitement).toBeDefined();
    expect(anger).toBeDefined();
    expect(excitement!.attachedTo.inferredTitle).toMatch(/Amazon/i);
    expect(anger!.attachedTo.inferredTitle).toMatch(/Abuela/i);
  });

  it('emotion does not create standalone card', () => {
    expect(shouldCreateEmotionBookCard).toBeDefined();
    const result = infer('I felt rejected after Ashley blocked me.');
    expect(result.accepted.every((s) => shouldCreateEmotionBookCard(s) === false)).toBe(true);
    expect(STANDALONE_EMOTION_LABELS.has('rejection')).toBe(true);
    expect(result.accepted.every((s) => Boolean(s.attachedTo.inferredTitle))).toBe(true);
  });

  it('emotional arc appends phases', () => {
    let arcState = {};
    const first = infer('Sol ghosted me after prom.', { priorArcPhases: arcState });
    arcState = first.arcState;
    const second = infer('I was mad when Sol blocked me.', { priorArcPhases: arcState });
    const phases = second.arcState['sol'] ?? [];
    expect(phases).toContain('rejection');
    expect(phases).toContain('anger');
    const { arcPhase } = appendArcPhase({}, 'sol', 'longing');
    expect(arcPhase).toContain('longing');
  });

  it('sensitive emotion context requires review', () => {
    expect(requiresSensitiveReview('people wanted to jump me at the party')).toBe(true);
    expect(requiresSensitiveReview('I blacked out last night')).toBe(true);
    const result = infer('people wanted to jump me so I ran.');
    expect(result.accepted.every((s) => s.requiresReview)).toBe(true);
  });

  it('provenance required', () => {
    const result = infer('I felt rejected when Sol ghosted me.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const signal of result.accepted) {
      expect(hasProvenance(signal)).toBe(true);
      expect(signal.sourceMessageIds).toContain('msg-1');
      expect(signal.evidencePhrases.length).toBeGreaterThan(0);
      expect(signal.inferredNotConfirmed).toBe(true);
    }
  });
});

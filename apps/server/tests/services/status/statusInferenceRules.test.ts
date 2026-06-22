import { describe, it, expect } from 'vitest';

import { isSkippedEvent } from '../../../src/services/status/inference/eventStatusInference';
import { getEntityLifecycleSummary } from '../../../src/services/status/inference/lifecycleTimelineService';
import {
  hasProvenance,
  hasUncertaintyLanguage,
  shouldCreateStatusCard,
} from '../../../src/services/status/inference/statusInferenceService';
import { statusInferenceService } from '../../../src/services/status/inference/statusInferenceService';
import { statusHistoryPreserved } from '../../../src/services/status/inference/statusTransitionResolver';

function infer(text: string, extra: Parameters<typeof statusInferenceService.inferFromMessage>[0] = {}) {
  return statusInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findStatus(result: ReturnType<typeof infer>, titlePart: string) {
  return result.accepted.find((s) =>
    (s.inferredTitle ?? '').toLowerCase().includes(titlePart.toLowerCase()),
  );
}

describe('status inference rules', () => {
  it('Oscar dormant since before covid', () => {
    const result = infer("Oscar and I haven't talked since before covid — dormant friendship.");
    const status = findStatus(result, 'Oscar');
    expect(status).toBeDefined();
    expect(status!.status).toBe('dormant');
    expect(status!.attachedToType).toBe('relationship');
  });

  it('Sol blocked/reappeared arc', () => {
    let state = {};
    const blocked = infer('Sol blocked me after prom.', { priorLifecycle: state });
    state = blocked.lifecycleState;
    const reappeared = infer('Sol reappeared and texted again.', { priorLifecycle: state });
    const arc = getEntityLifecycleSummary(reappeared.lifecycleState, 'Sol');
    expect(arc.some((e) => e.status === 'blocked')).toBe(true);
    expect(arc.some((e) => e.transition === 'revived' || e.status === 'active')).toBe(true);
  });

  it('LoreBook active from working on it', () => {
    const result = infer('I am working on LoreBook every night now.');
    const status = findStatus(result, 'LoreBook');
    expect(status).toBeDefined();
    expect(status!.status).toBe('active');
    expect(status!.attachedToType).toBe('project');
  });

  it('project paused then resumed creates transitions', () => {
    const result = infer('LoreBook was paused but I started working on it again.');
    const arc = getEntityLifecycleSummary(result.lifecycleState, 'LoreBook');
    expect(arc.some((e) => e.status === 'paused')).toBe(true);
    expect(arc.some((e) => e.transition === 'resumed' || e.status === 'active')).toBe(true);
    expect(arc.length).toBeGreaterThanOrEqual(2);
  });

  it('Amazon offer pending', () => {
    const result = infer('I got offer from Amazon but no letter yet.');
    const status = findStatus(result, 'Amazon');
    expect(status).toBeDefined();
    expect(status!.status).toBe('pending');
  });

  it('Meridian Robotics worked at = former if past tense', () => {
    const result = infer('I worked at Meridian Robotics on navigation stacks.');
    const status = findStatus(result, 'Meridian');
    expect(status).toBeDefined();
    expect(status!.status).toBe('former');
  });

  it('Kickboxing learning = current', () => {
    const result = infer('I am learning kickboxing as a beginner.');
    const status = findStatus(result, 'Kickboxing');
    expect(status).toBeDefined();
    expect(status!.status).toBe('current');
    expect(status!.attachedToType).toBe('skill');
  });

  it('Boxing used to teach = former paid skill', () => {
    const result = infer('I used to teach boxing for pay on weekends.');
    const status = findStatus(result, 'Boxing');
    expect(status).toBeDefined();
    expect(status!.status).toBe('former');
  });

  it('event did not go = skipped', () => {
    const result = infer("I didn't go to Ska Prom — skipped it.");
    const status = findStatus(result, 'Ska Prom') ?? findStatus(result, 'event');
    expect(status).toBeDefined();
    expect(isSkippedEvent(status!)).toBe(true);
  });

  it('uncertainty requires review', () => {
    expect(hasUncertaintyLanguage('Maybe Oscar and I are still friends, not sure.')).toBe(true);
    const result = infer('Maybe Oscar and I are still friends, not sure.');
    expect(result.accepted.every((s) => s.requiresReview)).toBe(true);
    expect(result.accepted.some((s) => s.status === 'uncertain')).toBe(true);
  });

  it('status change appends, not overwrites', () => {
    const first = infer('Oscar friendship is dormant since before covid.');
    const priorCount = Object.values(first.lifecycleState).flat().length;
    const second = infer('Oscar and I might talk again soon.', {
      priorLifecycle: first.lifecycleState,
    });
    const nextCount = Object.values(second.lifecycleState).flat().length;
    expect(statusHistoryPreserved(Object.values(first.lifecycleState).flat(), Object.values(second.lifecycleState).flat())).toBe(true);
    expect(nextCount).toBeGreaterThanOrEqual(priorCount);
  });

  it('provenance required', () => {
    const result = infer('Working on LoreBook and learning kickboxing.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const signal of result.accepted) {
      expect(hasProvenance(signal)).toBe(true);
      expect(signal.sourceMessageIds).toContain('msg-1');
      expect(shouldCreateStatusCard(signal)).toBe(false);
    }
  });
});

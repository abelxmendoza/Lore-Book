import { describe, it, expect } from 'vitest';
import { detectConversationMilestone, MILESTONE_MIN_COMPOSITE } from './milestoneDetector';

describe('detectConversationMilestone', () => {
  it('detects memory_recognition', () => {
    const r = detectConversationMilestone('Wow, you actually remembered that!');
    expect(r?.type).toBe('memory_recognition');
    expect(r!.score).toBeGreaterThanOrEqual(MILESTONE_MIN_COMPOSITE);
  });

  it('detects first_time_felt_alive', () => {
    const r = detectConversationMilestone('This was the first time LoreBook felt alive to me.');
    expect(r?.type).toBe('first_time_felt_alive');
  });

  it('detects exceeded_expectation when the app is the explicit referent', () => {
    const r = detectConversationMilestone("That's exactly what I hoped you'd remember.");
    expect(r?.type).toBe('exceeded_expectation');
  });

  it('detects app_gratitude', () => {
    const r = detectConversationMilestone('Thank you for remembering that about me.');
    expect(r?.type).toBe('app_gratitude');
  });

  it('does not fire on a life-event statement with no app referent', () => {
    const r = detectConversationMilestone("That's exactly what I hoped for in a new job.");
    expect(r).toBeNull();
  });

  it('does not fire on an ordinary thanks greeting', () => {
    const r = detectConversationMilestone('Thanks!');
    expect(r).toBeNull();
  });

  it('does not fire on unrelated chat', () => {
    const r = detectConversationMilestone('What is my job like these days?');
    expect(r).toBeNull();
  });
});

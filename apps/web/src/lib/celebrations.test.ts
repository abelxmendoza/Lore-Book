import { describe, it, expect, vi, beforeEach } from 'vitest';
import { celebrationForDemoEffect, triggerCelebration, CELEBRATION_EVENT } from './celebrations';

describe('celebrations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps demo skill_added to skill variant', () => {
    const payload = celebrationForDemoEffect({
      kind: 'skill_added',
      title: 'Cello added to Skills',
      xp: 35,
    });
    expect(payload).toEqual({
      variant: 'skill',
      label: 'Cello added to Skills',
      subtitle: undefined,
      xp: 35,
    });
  });

  it('returns null for non-visual demo kinds', () => {
    expect(
      celebrationForDemoEffect({ kind: 'processing', title: 'Working…' })
    ).toBeNull();
  });

  it('dispatches lk:celebration with payload', () => {
    const handler = vi.fn();
    window.addEventListener(CELEBRATION_EVENT, handler);
    triggerCelebration({ variant: 'skill', label: 'Test skill', xp: 10 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail.label).toBe('Test skill');
    window.removeEventListener(CELEBRATION_EVENT, handler);
  });
});

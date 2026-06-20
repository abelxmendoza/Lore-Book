import { describe, it, expect } from 'vitest';
import {
  evaluateLoreBookNoticeGate,
  formatLoreBookNoticeMessage,
  loreBookNoticeItemKey,
  type LoreBookNoticeGateState,
} from './loreBookNoticePolicy';
import type { LoreBookNoticeEvent } from './loreBookNoticeTypes';

describe('loreBookNoticePolicy', () => {
  const emptyState: LoreBookNoticeGateState = {
    toastTimestamps: [],
    seenItemKeys: new Set(),
  };

  const notice = (items: LoreBookNoticeEvent['items']): LoreBookNoticeEvent => ({
    chatMessageId: 'msg-1',
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    items,
  });

  describe('formatLoreBookNoticeMessage', () => {
    it('formats single item with domain label', () => {
      expect(
        formatLoreBookNoticeMessage([{ domain: 'quests', name: 'Ship beta', confidence: 0.9 }])
      ).toBe('LoreBook noticed a new quest: Ship beta');
    });

    it('formats two items', () => {
      const msg = formatLoreBookNoticeMessage([
        { domain: 'characters', name: 'Oscar Martinez', confidence: 0.9 },
        { domain: 'locations', name: 'Gothicumbia', confidence: 0.85 },
      ]);
      expect(msg).toContain('Oscar Martinez');
      expect(msg).toContain('Gothicumbia');
    });

    it('collapses three or more into primary + others', () => {
      const msg = formatLoreBookNoticeMessage([
        { domain: 'quests', name: 'A', confidence: 0.9 },
        { domain: 'skills', name: 'B', confidence: 0.9 },
        { domain: 'projects', name: 'C', confidence: 0.9 },
      ]);
      expect(msg).toMatch(/and 2 others$/);
    });
  });

  describe('evaluateLoreBookNoticeGate', () => {
    it('allows first notice through', () => {
      const result = evaluateLoreBookNoticeGate(
        notice([{ domain: 'quests', name: 'Ship beta', confidence: 0.9 }]),
        emptyState
      );
      expect(result.shouldShow).toBe(true);
      expect(result.message).toContain('Ship beta');
      expect(result.nextState.seenItemKeys.has(loreBookNoticeItemKey({ domain: 'quests', name: 'Ship beta' }))).toBe(true);
    });

    it('blocks duplicate item in same session', () => {
      const state: LoreBookNoticeGateState = {
        toastTimestamps: [Date.now()],
        seenItemKeys: new Set([loreBookNoticeItemKey({ domain: 'quests', name: 'Ship beta' })]),
      };
      const result = evaluateLoreBookNoticeGate(
        notice([{ domain: 'quests', name: 'Ship beta', confidence: 0.9 }]),
        state
      );
      expect(result.shouldShow).toBe(false);
    });

    it('enforces max toasts per window', () => {
      const now = Date.now();
      const state: LoreBookNoticeGateState = {
        toastTimestamps: [now - 1000, now - 500],
        seenItemKeys: new Set(),
      };
      const result = evaluateLoreBookNoticeGate(
        notice([{ domain: 'skills', name: 'Robotics', confidence: 0.9 }]),
        state,
        { maxToastsPerWindow: 2, windowMs: 60_000 }
      );
      expect(result.shouldShow).toBe(false);
    });

    it('filters low-confidence client-side as defense in depth', () => {
      const result = evaluateLoreBookNoticeGate(
        notice([{ domain: 'quests', name: 'Weak', confidence: 0.3 }]),
        emptyState
      );
      expect(result.shouldShow).toBe(false);
    });
  });
});

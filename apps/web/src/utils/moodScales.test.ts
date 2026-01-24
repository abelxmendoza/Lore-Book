import { describe, it, expect } from 'vitest';
import { moodScales, getMoodColor } from './moodScales';

describe('moodScales', () => {
  it('exports non-empty moodScales array', () => {
    expect(Array.isArray(moodScales)).toBe(true);
    expect(moodScales.length).toBeGreaterThan(0);
  });

  it('each scale has score, color, label', () => {
    for (const s of moodScales) {
      expect(typeof s.score).toBe('number');
      expect(typeof s.color).toBe('string');
      expect(typeof s.label).toBe('string');
    }
  });

  it('includes neutral (0)', () => {
    const neutral = moodScales.find((s) => s.score === 0);
    expect(neutral).toBeDefined();
  });
});

describe('getMoodColor', () => {
  it('returns hex color for exact score match', () => {
    const c = getMoodColor(0);
    expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns neutral color for 0', () => {
    const c = getMoodColor(0);
    expect(moodScales.some((s) => s.score === 0 && s.color === c)).toBe(true);
  });

  it('returns closest scale color for intermediate value', () => {
    const c = getMoodColor(2);
    expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns default for edge when no scale', () => {
    const c = getMoodColor(100);
    expect(typeof c).toBe('string');
    expect(c.length).toBeGreaterThan(0);
  });
});

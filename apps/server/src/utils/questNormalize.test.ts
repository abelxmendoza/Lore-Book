import { describe, it, expect } from 'vitest';
import { clampQuestScore, normalizeQuestType } from '../utils/questNormalize';

describe('questNormalize', () => {
  it('normalizes weekly quest types', () => {
    expect(normalizeQuestType('weekly')).toBe('side');
  });

  it('coerces string scores', () => {
    expect(clampQuestScore('7')).toBe(7);
  });
});

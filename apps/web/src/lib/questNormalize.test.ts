import { describe, it, expect } from 'vitest';
import { clampQuestScore, normalizeQuestType } from './questNormalize';

describe('normalizeQuestType', () => {
  it('passes through valid types', () => {
    expect(normalizeQuestType('main')).toBe('main');
    expect(normalizeQuestType('daily')).toBe('daily');
  });

  it('maps weekly to side', () => {
    expect(normalizeQuestType('weekly')).toBe('side');
  });
});

describe('clampQuestScore', () => {
  it('coerces string numbers', () => {
    expect(clampQuestScore('8')).toBe(8);
  });
});

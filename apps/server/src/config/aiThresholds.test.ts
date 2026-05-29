import { describe, it, expect } from 'vitest';
import { AI_THRESHOLDS } from './aiThresholds';

// Keys whose values are integer counts, not 0-1 probabilities.
const COUNT_THRESHOLDS = new Set<string>(['ENTITY_CONFIRMATION_THRESHOLD']);

describe('AI_THRESHOLDS', () => {
  it('probability values are in the 0–1 range', () => {
    for (const [key, value] of Object.entries(AI_THRESHOLDS)) {
      if (COUNT_THRESHOLDS.has(key)) continue;
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(value, key).toBeLessThanOrEqual(1);
    }
  });

  it('count thresholds are positive integers', () => {
    for (const key of COUNT_THRESHOLDS) {
      const value = (AI_THRESHOLDS as Record<string, number>)[key];
      expect(value, key).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(value), key).toBe(true);
    }
  });

  it('JW thresholds form a descending ladder', () => {
    expect(AI_THRESHOLDS.JW_ENTITY_MATCH).toBeGreaterThan(AI_THRESHOLDS.JW_PARTIAL_HIGH);
    expect(AI_THRESHOLDS.JW_PARTIAL_HIGH).toBeGreaterThan(AI_THRESHOLDS.JW_PARTIAL_LOW);
  });

  it('claim confidence floor is below semantic match threshold', () => {
    expect(AI_THRESHOLDS.CLAIM_CONFIDENCE_FLOOR).toBeLessThanOrEqual(
      AI_THRESHOLDS.SEMANTIC_ENTITY_MATCH
    );
  });

  it('contradiction thresholds are ordered correctly', () => {
    expect(AI_THRESHOLDS.CONTRADICTION_CONFIDENCE).toBeGreaterThan(
      AI_THRESHOLDS.PARTIAL_SUPPORT_ALERT
    );
  });
});

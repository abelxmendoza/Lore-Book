import { describe, it, expect } from 'vitest';
import {
  epistemicStateFromConfidence,
  mapTruthStateToEpistemic,
  canPromoteTo,
  epistemicRetrievalWeight,
} from './epistemicState';

describe('epistemicState', () => {
  it('maps confidence bands to epistemic states', () => {
    expect(epistemicStateFromConfidence(0.95)).toBe('VERIFIED');
    expect(epistemicStateFromConfidence(0.7)).toBe('LIKELY');
    expect(epistemicStateFromConfidence(0.45)).toBe('POSSIBLE');
    expect(epistemicStateFromConfidence(0.1)).toBe('UNKNOWN');
  });

  it('respects override flags', () => {
    expect(epistemicStateFromConfidence(0.2, { userVerified: true })).toBe('VERIFIED');
    expect(epistemicStateFromConfidence(0.9, { contradicted: true })).toBe('CONTRADICTED');
    expect(epistemicStateFromConfidence(0.9, { deprecated: true })).toBe('DEPRECATED');
  });

  it('maps legacy truth states', () => {
    expect(mapTruthStateToEpistemic('CANONICAL')).toBe('VERIFIED');
    expect(mapTruthStateToEpistemic('DISPUTED')).toBe('CONTRADICTED');
    expect(mapTruthStateToEpistemic('REVISED')).toBe('DEPRECATED');
  });

  it('gates promotion and retrieval weight', () => {
    expect(canPromoteTo('POSSIBLE', 'LIKELY')).toBe(true);
    expect(canPromoteTo('DEPRECATED', 'LIKELY')).toBe(false);
    expect(epistemicRetrievalWeight('VERIFIED')).toBeGreaterThan(epistemicRetrievalWeight('UNKNOWN'));
  });
});

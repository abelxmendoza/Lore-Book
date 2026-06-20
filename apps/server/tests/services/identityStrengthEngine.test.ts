import { describe, expect, it } from 'vitest';

import {
  computeIdentityStrength,
  identityBand,
} from '../../src/services/identity/identityStrengthEngine';

describe('IdentityStrengthEngine — identityBand', () => {
  it('maps scores to the documented bands at boundaries', () => {
    expect(identityBand(0)).toBe('Weak Identity');
    expect(identityBand(25)).toBe('Weak Identity');
    expect(identityBand(26)).toBe('Emerging Identity');
    expect(identityBand(50)).toBe('Emerging Identity');
    expect(identityBand(51)).toBe('Established Identity');
    expect(identityBand(75)).toBe('Established Identity');
    expect(identityBand(76)).toBe('Strong Identity');
    expect(identityBand(90)).toBe('Strong Identity');
    expect(identityBand(91)).toBe('Canonical Identity');
    expect(identityBand(100)).toBe('Canonical Identity');
  });
});

describe('IdentityStrengthEngine — computeIdentityStrength', () => {
  it('scores an empty/unevidenced entity as Weak', () => {
    const s = computeIdentityStrength({});
    expect(s.score).toBeLessThanOrEqual(25);
    expect(identityBand(s.score)).toBe('Weak Identity');
    expect(s.evidenceStrength).toBeLessThanOrEqual(0.2);
    expect(s.relationshipStrength).toBe(0);
  });

  it('produces all six output fields in range', () => {
    const s = computeIdentityStrength({
      confidence: 0.7,
      evidenceCount: 4,
      evidenceSourceKinds: 2,
      provenanceQuality: 0.6,
      connectedEntities: 3,
      confirmedRelationships: 1,
      interactionCount: 5,
      ambiguity: 0.2,
      duplicateCandidates: 1,
      contradictoryClaims: 0,
    });
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    for (const k of ['confidence', 'evidenceStrength', 'relationshipStrength', 'ambiguityRisk', 'contradictionRisk'] as const) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(1);
    }
  });

  it('rewards rich, confirmed, well-evidenced identities toward Strong/Canonical', () => {
    const s = computeIdentityStrength({
      confidence: 0.95,
      evidenceCount: 30,
      evidenceSourceKinds: 6,
      provenanceQuality: 0.95,
      connectedEntities: 12,
      confirmedRelationships: 11,
      interactionCount: 40,
      ambiguity: 0,
      duplicateCandidates: 0,
      contradictoryClaims: 0,
    });
    expect(s.score).toBeGreaterThanOrEqual(76);
  });

  it('does not overwrite confidence — it passes it through unchanged', () => {
    const s = computeIdentityStrength({ confidence: 0.42, evidenceCount: 10 });
    expect(s.confidence).toBe(0.42);
  });

  it('penalizes contradictions: a contradicted identity cannot read as strong', () => {
    const base = {
      confidence: 0.95,
      evidenceCount: 30,
      evidenceSourceKinds: 6,
      provenanceQuality: 0.95,
      connectedEntities: 12,
      confirmedRelationships: 11,
      interactionCount: 40,
    };
    const clean = computeIdentityStrength(base);
    const contradicted = computeIdentityStrength({ ...base, contradictoryClaims: 5 });
    expect(contradicted.contradictionRisk).toBeGreaterThan(0.5);
    expect(contradicted.score).toBeLessThan(clean.score);
    expect(contradicted.score).toBeLessThan(76);
  });

  it('penalizes ambiguity and duplicate candidates', () => {
    const base = { confidence: 0.8, evidenceCount: 10, connectedEntities: 5, confirmedRelationships: 3 };
    const clean = computeIdentityStrength(base);
    const ambiguous = computeIdentityStrength({ ...base, ambiguity: 0.9, duplicateCandidates: 4 });
    expect(ambiguous.ambiguityRisk).toBeGreaterThan(clean.ambiguityRisk);
    expect(ambiguous.score).toBeLessThan(clean.score);
  });

  it('clamps out-of-range inputs without throwing', () => {
    const s = computeIdentityStrength({
      confidence: 5,
      evidenceCount: -3,
      provenanceQuality: 9,
      ambiguity: 2,
      contradictoryClaims: -1,
    });
    expect(s.confidence).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.ambiguityRisk).toBeLessThanOrEqual(1);
  });
});

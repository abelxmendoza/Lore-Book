import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';

const BRYAN_RESPONSE =
  'Bryan appears to have been one of your closest friends from middle school. You attended Whittier Christian Middle School together and practiced in the school band.';

describe('assistantClaimExtractor', () => {
  it('extracts relationship, school, and group claims from Bryan example', () => {
    const claims = extractAssistantClaims(BRYAN_RESPONSE);
    const types = claims.map((c) => c.type);
    expect(types).toContain('relationship_claim');
    expect(types).toContain('school_claim');
    expect(claims.some((c) => /Whittier Christian Middle School/i.test(c.claim))).toBe(true);
  });

  it('tags inference language on relationship claims', () => {
    const claims = extractAssistantClaims(BRYAN_RESPONSE);
    const rel = claims.find((c) => c.type === 'relationship_claim');
    expect(rel?.statementKind).toBe('INFERENCE');
    expect(rel?.certainty).toBe('uncertain');
  });
});

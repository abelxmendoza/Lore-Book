import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import { groundClaims } from '../../../src/services/responseCompiler/groundingChecker';

const WITNESS = [
  {
    id: '821',
    role: 'user' as const,
    content: 'Bryan and I went to Whittier Christian Middle School. We were in band together.',
  },
];

describe('groundingChecker', () => {
  it('grounds school claim when user witness exists', () => {
    const response =
      'Bryan attended Whittier Christian Middle School with you and participated in the school band.';
    const claims = extractAssistantClaims(response);
    const grounded = groundClaims(claims, WITNESS);
    const school = grounded.find((c) => c.type === 'school_claim');
    expect(school?.grounding).toBe('grounded');
    expect(school?.provenance?.sourceMessageIds).toContain('821');
  });

  it('marks unsupported claim when no evidence exists', () => {
    const response = 'Bryan became a professional musician after college.';
    const claims = extractAssistantClaims(response);
    const grounded = groundClaims(claims, WITNESS);
    expect(grounded.some((c) => c.grounding === 'unsupported')).toBe(true);
  });

  it('marks inferred relationship when hedged', () => {
    const response = 'Bryan was probably your closest friend in middle school.';
    const claims = extractAssistantClaims(response);
    const grounded = groundClaims(claims, WITNESS);
    const rel = grounded.find((c) => c.type === 'relationship_claim');
    expect(rel?.grounding).toBe('inferred');
  });
});

import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import { detectContradictions } from '../../../src/services/responseCompiler/contradictionChecker';
import { responseCompilerService } from '../../../src/services/responseCompiler/responseCompilerService';

/**
 * Verifies the compiler behaves correctly once *real* canon (the shape
 * loadUserCanonFacts produces from omega_claims) is fed in — the production
 * path the canon loader now enables.
 */
describe('canon-grounded compile', () => {
  const canon = [
    { domain: 'work', fact: 'Works at Vanguard Robotics', entityName: 'Vanguard Robotics', sourceMessageId: 'm10' },
  ];

  it('flags an employment contradiction against loaded canon', () => {
    const claims = extractAssistantClaims('You currently work at SpaceX.');
    const contradictions = detectContradictions(claims, canon);
    expect(contradictions.some((c) => c.type === 'employment' && c.severity === 'high')).toBe(true);
  });

  it('does not contradict when assistant agrees with canon', () => {
    const claims = extractAssistantClaims('You work at Vanguard Robotics on robotics projects.');
    const contradictions = detectContradictions(claims, canon);
    expect(contradictions.length).toBe(0);
  });

  it('surfaces contradiction through full compile + blocks the memory write', () => {
    const compiled = responseCompilerService.compile({
      userId: 'u1',
      rawResponse: 'You currently work at SpaceX now.',
      sourceMessages: [],
      canonFacts: canon,
    });
    expect(compiled.contradictions.length).toBeGreaterThan(0);
    // Hard rule: nothing the assistant says becomes durable memory.
    expect(compiled.memoryCandidatesBlocked.length).toBeGreaterThan(0);
    expect(compiled.verifiedResponse).toMatch(/conflict/i);
  });
});

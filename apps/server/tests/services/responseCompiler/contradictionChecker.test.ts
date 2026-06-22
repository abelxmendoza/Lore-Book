import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import {
  applyContradictionsToGrounding,
  detectContradictions,
} from '../../../src/services/responseCompiler/contradictionChecker';
import { groundClaims } from '../../../src/services/responseCompiler/groundingChecker';

describe('contradictionChecker', () => {
  it('detects employment contradiction against canon', () => {
    const response = 'You currently work at SpaceX on robotics projects.';
    const claims = extractAssistantClaims(response);
    const canon = [{ domain: 'work', fact: 'Works at Northwind Labs', entityName: 'Northwind Labs' }];
    const contradictions = detectContradictions(claims, canon);
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0].type).toBe('employment');
    expect(contradictions[0].severity).toBe('high');
  });

  it('marks contradicted claims and blocks storage path', () => {
    const response = 'You currently work at SpaceX.';
    const claims = extractAssistantClaims(response);
    const canon = [{ domain: 'work', fact: 'Works at Northwind Labs' }];
    const contradictions = detectContradictions(claims, canon);
    const grounded = applyContradictionsToGrounding(groundClaims(claims, []), contradictions);
    expect(grounded.some((c) => c.grounding === 'contradicted')).toBe(true);
  });
});

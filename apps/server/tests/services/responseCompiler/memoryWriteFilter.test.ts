import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import { groundClaims } from '../../../src/services/responseCompiler/groundingChecker';
import { filterMemoryWrites, mayPromoteToMemory } from '../../../src/services/responseCompiler/memoryWriteFilter';
import { classifyStatementKind } from '../../../src/services/responseCompiler/inferenceClassifier';
import { bindProvenance } from '../../../src/services/responseCompiler/provenanceBinder';
import { responseCompilerService } from '../../../src/services/responseCompiler/responseCompilerService';

describe('memoryWriteFilter', () => {
  it('blocks all assistant inference from becoming memory', () => {
    const response = 'Bryan appears to have been one of your closest friends from middle school.';
    const claims = extractAssistantClaims(response);
    const grounded = groundClaims(claims, [
      { id: '1', role: 'user', content: 'Bryan and I were friends in middle school.' },
    ]);
    const blocked = filterMemoryWrites(grounded);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((b) => /assistant|Inferred|canon|witness/i.test(b.reason))).toBe(true);
    expect(grounded.every((c) => !mayPromoteToMemory(c))).toBe(true);
  });

  it('classifies fact vs inference vs question', () => {
    expect(classifyStatementKind('Bryan attended school with you.', { grounded: true })).toBe('FACT');
    expect(classifyStatementKind('Bryan appears to have been important.')).toBe('INFERENCE');
    expect(classifyStatementKind('Do you still talk to him?')).toBe('QUESTION');
    expect(classifyStatementKind('Would you like to add Bryan as a character?')).toBe('SUGGESTION');
  });

  it('binds provenance to grounded claims in full compile', () => {
    const compiled = responseCompilerService.compile({
      userId: 'u1',
      rawResponse:
        'Bryan attended Whittier Christian Middle School with you. We went to Whittier Christian Middle School together.',
      sourceMessages: [
        {
          id: '821',
          role: 'user',
          content: 'We went to Whittier Christian Middle School together with Bryan.',
        },
      ],
    });
    expect(compiled.provenanceBindings.length).toBeGreaterThan(0);
    expect(compiled.provenanceBindings[0].provenance.sourceMessageIds).toContain('821');
    expect(compiled.memoryCandidatesBlocked.length).toBeGreaterThan(0);
  });

  it('tags uncertainty in inspector report', () => {
    const compiled = responseCompilerService.compile({
      userId: 'u1',
      rawResponse: 'Bryan probably influenced your interest in music.',
      sourceMessages: [],
    });
    const report = responseCompilerService.toInspectorReport(compiled);
    expect(report.claims.some((c) => c.certainty === 'uncertain')).toBe(true);
    expect(compiled.certaintyScore).toBeLessThan(1);
  });
});

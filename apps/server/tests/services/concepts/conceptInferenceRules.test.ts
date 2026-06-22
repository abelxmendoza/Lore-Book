import { describe, it, expect } from 'vitest';

import { conceptInferenceService } from '../../../src/services/concepts/inference/conceptInferenceService';
import { isBareGenericConcept } from '../../../src/services/concepts/inference/namedConceptInference';
import { hasProvenance } from '../../../src/services/concepts/inference/conceptProvenanceService';

function infer(text: string, extra: Parameters<typeof conceptInferenceService.inferFromMessage>[0] = {}) {
  return conceptInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('concept inference rules', () => {
  it('detects Lexical Intelligence as technical_concept', () => {
    const result = infer('Lexical Intelligence is the core of how LoreBook understands chat.');
    const concept = findAccepted(result, 'Lexical Intelligence');
    expect(concept).toBeDefined();
    expect(concept!.conceptType).toBe('technical_concept');
    expect(concept!.context.projectContext).toMatch(/LoreBook/i);
  });

  it('detects Entity Gravity as product_concept', () => {
    const result = infer('Entity Gravity measures narrative importance in LoreBook.');
    const concept = findAccepted(result, 'Entity Gravity');
    expect(concept).toBeDefined();
    expect(concept!.conceptType).toBe('product_concept');
  });

  it('detects bad memory is worse than no memory as principle', () => {
    const result = infer('I believe "bad memory is worse than no memory" for LoreBook.');
    const concept = findAccepted(result, 'Bad Memory');
    expect(concept).toBeDefined();
    expect(concept!.conceptType).toMatch(/life_lesson|philosophy|belief/);
    expect(concept!.requiresReview).toBe(true);
  });

  it('rejects idea alone', () => {
    expect(isBareGenericConcept('idea')).toBe(true);
    const result = infer('That was a good idea.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'idea')).toBe(false);
  });

  it('rejects system alone', () => {
    expect(isBareGenericConcept('system')).toBe(true);
    const result = infer('The system is broken.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'system')).toBe(false);
  });

  it('detects ontology only in architecture context', () => {
    const without = infer('Ontology is a word I heard.');
    expect(without.accepted.some((c) => c.displayName === 'Ontology')).toBe(false);

    const withArch = infer('Our LoreBook ontology layer defines entity types in the architecture.');
    const concept = findAccepted(withArch, 'Ontology');
    expect(concept).toBeDefined();
    expect(concept!.conceptType).toBe('technical_concept');
    expect(concept!.context.sourceDomain).toBe('architecture');
  });

  it('detects social reputation as theme with emotional context', () => {
    const result = infer(
      'I keep worrying about social reputation and feeling rejected at shows.',
      { priorMentionCounts: { 'social reputation': 1 } },
    );
    const concept = findAccepted(result, 'Social Reputation');
    expect(concept).toBeDefined();
    expect(concept!.conceptType).toMatch(/social_concept|theme/);
    expect(concept!.requiresReview).toBe(true);
  });

  it('detects parser/compiler as technical concept under LoreBook', () => {
    const result = infer(
      'The LoreBook parser and compiler turn lexical spans into operations.',
    );
    const parser = findAccepted(result, 'Parser');
    const compiler = findAccepted(result, 'Compiler');
    expect(parser).toBeDefined();
    expect(compiler).toBeDefined();
    expect(parser!.context.projectContext).toMatch(/LoreBook/i);
  });

  it('attaches concept to project when LoreBook nearby', () => {
    const result = infer('Truth-State and Provenance are core LoreBook architecture ideas.');
    const truth = findAccepted(result, 'Truth-State');
    const prov = findAccepted(result, 'Provenance');
    expect(truth?.context.projectContext).toMatch(/LoreBook/i);
    expect(prov?.context.projectContext).toMatch(/LoreBook/i);
  });

  it('blocks wrong-domain entities', () => {
    const result = infer('Bryan is my best friend.', {
      knownDomains: { bryan: 'person' },
    });
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'bryan')).toBe(false);
  });

  it('requires provenance for every concept candidate', () => {
    const result = infer('Entity Gravity and Identity Integrity guide LoreBook design.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const concept of result.accepted) {
      expect(hasProvenance(concept)).toBe(true);
      expect(concept.sourceMessageIds.length).toBeGreaterThan(0);
      expect(concept.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('detects mental model pipeline', () => {
    const result = infer(
      'Lexer detects, parser understands, planner proposes, interpreter executes — that is the LoreBook pipeline.',
    );
    const model = findAccepted(result, 'Lexer-Parser');
    expect(model).toBeDefined();
    expect(model!.conceptType).toBe('mental_model');
  });

  it('assistant-generated guesses do not create concepts', () => {
    const result = conceptInferenceService.inferFromMessage({
      text: 'Entity Gravity might be important based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });
});

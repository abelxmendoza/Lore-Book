/**
 * Integration: real lexical analyzer → real ontology enrichment.
 *
 * Unlike the orchestration-level pipeline test (which mocks every downstream
 * service), this wires the *actual* lexical analyzer output into the *actual*
 * ontology enrichment mapper, asserting the lexical → ontology bridge produces
 * the metadata shape downstream consumers rely on. Corpus-driven so the same
 * golden cases exercise this layer too.
 */
import { describe, expect, it, vi } from 'vitest';

import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { enrichFromLexicalAnalysis } from '../../src/services/ontology/ontologyEnrichmentService';
import { getCorpusCase, LEXICAL_ONTOLOGY_CORPUS } from '../fixtures/lexicalOntologyCorpus';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) },
}));

const analyze = (text: string) =>
  lexicalAnalyzerService.analyzeMessage({ userId: 'u', messageId: 'm', text });

describe('lexical → ontology enrichment integration', () => {
  it('carries lexical ontology candidates and entity types into enrichment metadata', () => {
    const c = getCorpusCase('skills-org-improving-mainthing');
    const lexical = analyze(c.text);
    const meta = enrichFromLexicalAnalysis(lexical);

    expect(meta.source).toBe('lexical_analyzer');
    expect(meta.lexical_confidence).toBe(lexical.confidence);
    expect(Array.isArray(meta.lexical_ontology_candidates)).toBe(true);
    expect((meta.lexical_ontology_candidates as unknown[]).length).toBe(lexical.ontologyCandidates.length);

    const entityTypes = meta.lexical_entity_types as string[];
    expect(entityTypes).toContain('ORGANIZATION');
    expect(entityTypes).toContain('SKILL');

    // The lexical → ontology candidate bridge preserved the employer + skills.
    const candidates = meta.lexical_ontology_candidates as Array<{ predicate: string; object: string }>;
    expect(candidates.some((c) => c.predicate === 'worked_for' && /armstrong/i.test(c.object))).toBe(true);
    expect(candidates.some((c) => c.predicate === 'is_learning' && /ros2/i.test(c.object))).toBe(true);
  });

  it('always tags ontology metadata fields and mirrors candidate counts (all corpus cases)', () => {
    for (const c of LEXICAL_ONTOLOGY_CORPUS) {
      const lexical = analyze(c.text);
      const meta = enrichFromLexicalAnalysis(lexical);

      expect(meta.source, c.id).toBe('lexical_analyzer');
      expect(Array.isArray(meta.ontology_tags), c.id).toBe(true);
      expect(Array.isArray(meta.lexical_ontology_candidates), c.id).toBe(true);
      expect((meta.lexical_ontology_candidates as unknown[]).length, c.id).toBe(lexical.ontologyCandidates.length);
      expect(Array.isArray(meta.lexical_entity_types), c.id).toBe(true);
    }
  });
});

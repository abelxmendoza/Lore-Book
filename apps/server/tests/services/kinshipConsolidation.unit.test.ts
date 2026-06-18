/**
 * UNIT — kinship consolidation across the glossary-derived layers.
 *
 * After the consolidation, the glossary FAMILY entries are the single source of
 * truth and every kinship consumer derives from `familyRoleSpecs()`. These tests
 * exercise diverse, multilingual, possessive, persona, and ERROR/negative cases
 * across all four layers so a regression in any consumer is caught immediately.
 */
import { describe, expect, it } from 'vitest';

import {
  GLOSSARY,
  familyContextWords,
  familyRoleSpecs,
} from '../../src/services/ontology/glossary';
import {
  extractKinshipMentions,
  hasKinshipTitle,
  kinshipRoleToString,
  parseKinshipFromName,
} from '../../src/services/kinship/kinshipGlossary';
import {
  resolveMention,
  type ResolutionCandidate,
} from '../../src/services/entities/entityResolutionCore';
import { scoreKinshipInContext } from '../../src/services/ontology/lexicalIntelligence';

// ── Layer 1: glossary helpers (the source of truth) ──────────────────────────
describe('glossary kinship helpers', () => {
  it('derives every FAMILY role spec from the glossary FAMILY entries', () => {
    const familyEntries = GLOSSARY.filter((e) => e.category === 'FAMILY');
    expect(familyRoleSpecs().length).toBe(familyEntries.length);
    for (const spec of familyRoleSpecs()) {
      expect(spec.terms.length).toBeGreaterThan(0);
      expect(['TITLE_ONLY', 'TITLED']).toContain(spec.kinshipForm);
      // terms are lowercase and longest-first
      expect(spec.terms).toEqual([...spec.terms].map((t) => t.toLowerCase()));
      for (let i = 1; i < spec.terms.length; i++) {
        expect(spec.terms[i - 1].length).toBeGreaterThanOrEqual(spec.terms[i].length);
      }
    }
  });

  it('exposes generation offsets for graph reasoning', () => {
    const byRole = new Map(familyRoleSpecs().map((s) => [s.role, s]));
    expect(byRole.get('GRANDMOTHER')?.generation).toBe(-2);
    expect(byRole.get('MOTHER')?.generation).toBe(-1);
    expect(byRole.get('SIBLING')?.generation).toBe(0);
  });

  it('familyContextWords contains multilingual surface terms, no duplicates', () => {
    const words = familyContextWords();
    expect(words).toContain('abuela');
    expect(words).toContain('tío');
    expect(words).toContain('hermano');
    expect(new Set(words).size).toBe(words.length);
  });
});

// ── Layer 2: kinshipGlossary extraction (glossary-derived regex) ─────────────
describe('kinshipGlossary extraction', () => {
  const roleCases: Array<{ name: string; role: string }> = [
    { name: 'Abuela', role: 'GRANDMOTHER' },
    { name: 'grandma', role: 'GRANDMOTHER' },
    { name: 'Nonna', role: 'GRANDMOTHER' },
    { name: 'Abuelo', role: 'GRANDFATHER' },
    { name: 'Mom', role: 'MOTHER' },
    { name: 'mama', role: 'MOTHER' },
    { name: 'Dad', role: 'FATHER' },
    { name: 'padre', role: 'FATHER' },
    { name: 'Tío Juan', role: 'UNCLE' },
    { name: 'Auntie Grace', role: 'AUNT' },
    { name: 'Tía Rosa', role: 'AUNT' },
    { name: 'cousin Marco', role: 'COUSIN' },
    { name: 'primo Luis', role: 'COUSIN' },
  ];
  it.each(roleCases)('parseKinshipFromName("$name") → $role', ({ name, role }) => {
    expect(parseKinshipFromName(name)?.role).toBe(role);
  });

  it('extracts multiple kin (incl. possessive) from one sentence', () => {
    const text = "I went to Abuela's house with Tío Juan and Tío Ray";
    const mentions = extractKinshipMentions(text);
    const names = mentions.map((m) => m.sourcePhrase.toLowerCase());
    expect(mentions.length).toBeGreaterThanOrEqual(3);
    expect(names.some((n) => n.includes('abuela'))).toBe(true);
    expect(names.some((n) => n.includes('juan'))).toBe(true);
    expect(names.some((n) => n.includes('ray'))).toBe(true);
  });

  it('hasKinshipTitle recognizes glossary terms across languages', () => {
    expect(hasKinshipTitle('Abuela')).toBe(true);
    expect(hasKinshipTitle('Tío Beto')).toBe(true);
    expect(hasKinshipTitle('hermana')).toBe(true);
  });

  it('kinshipRoleToString maps every role to a lowercase token', () => {
    for (const spec of familyRoleSpecs()) {
      const s = kinshipRoleToString(spec.role as never);
      expect(s).toBe(s.toLowerCase());
      expect(s.length).toBeGreaterThan(0);
    }
  });

  // ERROR / negative paths
  it('returns nothing for non-kin names and empty input', () => {
    expect(parseKinshipFromName('Velvet Hour')).toBeNull();
    expect(parseKinshipFromName('')).toBeNull();
    expect(extractKinshipMentions('We launched the product at the warehouse')).toEqual([]);
    expect(hasKinshipTitle('')).toBe(false);
    expect(hasKinshipTitle('DJ Nightshade')).toBe(false);
  });
});

// ── Layer 3: entityResolutionCore kinship equivalence ────────────────────────
describe('entityResolutionCore kinship equivalence', () => {
  const equivalences: Array<{ mention: string; candidate: string }> = [
    { mention: 'grandma', candidate: 'Abuela Rosa' },
    { mention: 'abuela', candidate: 'Grandma Rose' },
    { mention: 'mom', candidate: 'Mother' },
    { mention: 'papa', candidate: 'Dad' },
    { mention: 'primo', candidate: 'Cousin Mateo' },
    { mention: 'tía', candidate: 'Auntie Grace' },
  ];
  it.each(equivalences)('"$mention" resolves to "$candidate"', ({ mention, candidate }) => {
    const result = resolveMention(mention, [{ id: 'k1', name: candidate, aliases: [] }]);
    expect(result.action).toBe('resolve');
    expect(result.resolvedId).toBe('k1');
  });

  it('does NOT cross-match different kinship roles', () => {
    // "grandma" must not resolve to an uncle candidate.
    const result = resolveMention('grandma', [{ id: 'u1', name: 'Tío Juan', aliases: [] }]);
    expect(result.resolvedId).toBeNull();
  });

  it('disambiguates two same-role candidates without context', () => {
    const pool: ResolutionCandidate[] = [
      { id: 'a1', name: 'Tío Juan', aliases: [] },
      { id: 'a2', name: 'Tío Ray', aliases: [] },
    ];
    // "uncle" matches both uncles by kinship → ambiguous.
    const result = resolveMention('uncle', pool);
    expect(result.action).toBe('disambiguate');
    expect(result.resolvedId).toBeNull();
  });

  it('uses thread context to pick the right same-role candidate', () => {
    const pool: ResolutionCandidate[] = [
      { id: 'a1', name: 'Tío Juan', aliases: [] },
      { id: 'a2', name: 'Tío Ray', aliases: [] },
    ];
    const result = resolveMention('uncle', pool, { threadEntityIds: ['a2'] });
    expect(result.resolvedId).toBe('a2');
  });
});

// ── Layer 4: lexicalIntelligence context scoring (glossary FAMILY_CONTEXT) ────
describe('lexicalIntelligence scoreKinshipInContext', () => {
  it('treats title-leading kinship as kin and boosts with family context', () => {
    const v = scoreKinshipInContext('Tío Beto', 'at our family reunion with my abuela');
    expect(v.isKin).toBe(true);
    expect(v.relation).toBe('uncle');
    expect(v.confidence).toBeGreaterThan(0.9);
  });

  it('rejects persona/stage names with a scene context (Goth Tio)', () => {
    const v = scoreKinshipInContext('Goth Tio', 'met him at the warehouse goth show');
    expect(v.isKin).toBe(false);
  });

  it('rejects handle/stage-name shapes (punctuation/digits)', () => {
    const v = scoreKinshipInContext('Tio.420', 'on instagram');
    expect(v.isKin).toBe(false);
  });

  it('returns not-kin for empty / non-kin input', () => {
    expect(scoreKinshipInContext('', '').isKin).toBe(false);
    expect(scoreKinshipInContext('Velvet Hour', 'at the club').isKin).toBe(false);
  });
});

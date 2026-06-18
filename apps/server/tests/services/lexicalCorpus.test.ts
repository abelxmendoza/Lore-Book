/**
 * Table-driven lexical-intelligence tests driven by the shared golden corpus.
 *
 * Each corpus case is replayed through the real (deterministic) lexical analyzer
 * and every declared expectation is asserted. Adding a case to
 * `tests/fixtures/lexicalOntologyCorpus.ts` automatically extends coverage here.
 */
import { describe, expect, it, vi } from 'vitest';

import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import {
  LEXICAL_ONTOLOGY_CORPUS,
  type LexicalCorpusCase,
} from '../fixtures/lexicalOntologyCorpus';

// The analyzer itself is pure, but its import graph can transitively reach the
// Supabase client. Stub it so importing the service never needs real creds.
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })),
  },
}));

const includes = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

function analyze(c: LexicalCorpusCase) {
  return lexicalAnalyzerService.analyzeMessage({
    userId: 'corpus-user',
    messageId: `corpus-${c.id}`,
    text: c.text,
    threadId: 'corpus-thread',
  });
}

describe('lexical golden corpus', () => {
  it('has unique, non-empty case ids', () => {
    const ids = LEXICAL_ONTOLOGY_CORPUS.map((c) => c.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(LEXICAL_ONTOLOGY_CORPUS.map((c) => [c.id, c] as const))(
    'case: %s',
    (_id, c) => {
      const result = analyze(c);
      const e = c.expect;

      if (e.skills) {
        it.each(e.skills.map((s) => [s.nameIncludes, s] as const))(
          'detects skill matching "%s"',
          (_n, expected) => {
            const skill = result.skills.find((s) => includes(s.name, expected.nameIncludes));
            expect(skill, `no skill matching "${expected.nameIncludes}" in ${c.text}`).toBeDefined();
            if (!skill) return;
            if (expected.hobby_or_paid) expect(skill.hobby_or_paid).toBe(expected.hobby_or_paid);
            if (expected.proficiency_hint) expect(skill.proficiency_hint).toBe(expected.proficiency_hint);
            if (expected.enjoyment_hint) expect(skill.enjoyment_hint).toBe(expected.enjoyment_hint);
            if (expected.category) expect(skill.category).toBe(expected.category);
          }
        );
      }

      if (e.relationships) {
        it.each(e.relationships.map((r) => [r.role, r] as const))(
          'detects relationship role "%s"',
          (_r, expected) => {
            const rel = result.relationships.find((r) => r.role === expected.role);
            expect(rel, `no relationship role "${expected.role}" in ${c.text}`).toBeDefined();
            if (rel && expected.sentiment) expect(rel.sentiment).toBe(expected.sentiment);
          }
        );
      }

      if (e.places) {
        it.each(e.places.map((p) => [p.category, p] as const))(
          'detects place category "%s"',
          (_cat, expected) => {
            const place = result.places.find(
              (p) =>
                p.category === expected.category &&
                (!expected.nameIncludes || includes(p.name, expected.nameIncludes))
            );
            expect(place, `no place category "${expected.category}" in ${c.text}`).toBeDefined();
          }
        );
      }

      if (e.emotions) {
        it.each(e.emotions.map((em, i) => [em.label ?? `emotion-${i}`, em] as const))(
          'detects emotion "%s"',
          (_l, expected) => {
            const emo = result.emotions.find(
              (em) => (!expected.label || em.label === expected.label)
            );
            expect(emo, `no emotion ${JSON.stringify(expected)} in ${c.text}`).toBeDefined();
            if (emo && expected.valence) expect(emo.valence).toBe(expected.valence);
          }
        );
      }

      if (e.events) {
        it.each(e.events)('detects life event "%s"', (kind) => {
          expect(
            result.events.map((ev) => ev.kind),
            `events for: ${c.text}`
          ).toContain(kind);
        });
      }

      if (e.entities) {
        it.each(e.entities.map((en) => [`${en.type}:${en.surfaceIncludes ?? '*'}`, en] as const))(
          'extracts entity "%s"',
          (_k, expected) => {
            const found = result.entities.find(
              (en) =>
                en.type === expected.type &&
                (!expected.surfaceIncludes || includes(en.surface, expected.surfaceIncludes))
            );
            expect(found, `no entity ${JSON.stringify(expected)} in ${c.text}`).toBeDefined();
          }
        );
      }

      if (e.intents) {
        it.each(e.intents)('detects intent kind "%s"', (kind) => {
          expect(
            result.intents.map((i) => i.kind),
            `intents for: ${c.text}`
          ).toContain(kind);
        });
      }

      if (e.ontologyCandidates) {
        it.each(
          e.ontologyCandidates.map(
            (oc) => [`${oc.predicate ?? '*'}:${oc.objectIncludes ?? '*'}`, oc] as const
          )
        )('produces ontology candidate "%s"', (_k, expected) => {
          const found = result.ontologyCandidates.find(
            (oc) =>
              (!expected.predicate || oc.predicate === expected.predicate) &&
              (!expected.objectIncludes || includes(oc.object, expected.objectIncludes))
          );
          expect(found, `no ontology candidate ${JSON.stringify(expected)} in ${c.text}`).toBeDefined();
        });
      }

      if (e.ambiguityFlags) {
        it.each(e.ambiguityFlags)('raises ambiguity flag "%s"', (flag) => {
          expect(result.ambiguityFlags, `flags for: ${c.text}`).toContain(flag);
        });
      }

      if (typeof e.needsClarification === 'boolean') {
        it(`needsClarification === ${e.needsClarification}`, () => {
          expect(result.needsClarification).toBe(e.needsClarification);
        });
      }

      if (typeof e.minConfidence === 'number') {
        it(`confidence >= ${e.minConfidence}`, () => {
          expect(result.confidence).toBeGreaterThanOrEqual(e.minConfidence as number);
        });
      }

      if (e.shouldNotProduce) {
        const guard = e.shouldNotProduce;
        if (guard.entityTypes) {
          it.each(guard.entityTypes)('does not produce entity type "%s"', (type) => {
            expect(result.entities.map((en) => en.type)).not.toContain(type);
          });
        }
        if (guard.relationshipRoles) {
          it.each(guard.relationshipRoles)('does not produce relationship role "%s"', (role) => {
            expect(result.relationships.map((r) => r.role)).not.toContain(role);
          });
        }
        if (guard.eventKinds) {
          it.each(guard.eventKinds)('does not produce event kind "%s"', (kind) => {
            expect(result.events.map((ev) => ev.kind)).not.toContain(kind);
          });
        }
      }
    }
  );
});

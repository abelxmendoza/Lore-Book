/**
 * Structural integrity invariants for the lexical glossary.
 *
 * The glossary is the single source of truth for the lexical/ontology layer;
 * adding one entry extends discovery, enrichment, the explorer, and classifier
 * lexicons. These tests pin the shape so a malformed entry (bad domain, weight
 * out of range, missing surface target, alias that no longer resolves) is caught
 * immediately rather than silently degrading downstream behaviour.
 */
import { describe, expect, it } from 'vitest';

import {
  GLOSSARY,
  glossaryAliases,
  lookupKeyword,
  type GlossaryEntry,
  type RelationshipHint,
  type QueryHint,
  type ActionHint,
} from '../../src/services/ontology/glossary';
import { isRootType } from '../../src/services/ontology/canonical';

const RELATIONSHIP_HINTS: ReadonlySet<RelationshipHint> = new Set([
  'FAMILY_RELATIONSHIP', 'SOCIAL_RELATIONSHIP', 'ROMANTIC_RELATIONSHIP',
  'WORK_RELATIONSHIP', 'MENTOR_RELATIONSHIP', 'ADVERSARIAL_RELATIONSHIP',
  'CREATIVE_RELATIONSHIP',
]);

const QUERY_HINTS: ReadonlySet<QueryHint> = new Set([
  'TEMPORAL_QUERY', 'GOAL_QUERY', 'PROJECT_QUERY', 'SKILL_QUERY', 'PERSON_QUERY',
  'LOCATION_QUERY', 'EVENT_QUERY', 'COMMUNITY_QUERY', 'RELATIONSHIP_QUERY',
  'IDENTITY_QUERY', 'MEMORY_QUERY', 'INSIGHT_QUERY', 'DECISION_QUERY',
  'CONTRADICTION_QUERY', 'ESSENCE_QUERY', 'ANALYTICS_QUERY',
]);

const ACTION_HINTS: ReadonlySet<ActionHint> = new Set([
  'IDENTITY_CLAIM', 'RELATIONSHIP_CLAIM', 'DISAMBIGUATE', 'OPEN_SURFACE', 'ENTITY_AUTHORITY',
]);

const label = (e: GlossaryEntry) => `${e.keyword} (${e.domain}/${e.category})`;

describe('glossary integrity', () => {
  it('is non-empty', () => {
    expect(GLOSSARY.length).toBeGreaterThan(0);
  });

  describe.each(GLOSSARY.map((e) => [label(e), e] as const))('entry %s', (_l, entry) => {
    it('has a non-empty, lowercase keyword', () => {
      expect(entry.keyword.length).toBeGreaterThan(0);
      expect(entry.keyword).toBe(entry.keyword.toLowerCase());
    });

    it('has a valid RootType domain', () => {
      expect(isRootType(entry.domain), `${entry.keyword} domain ${entry.domain}`).toBe(true);
    });

    it('has a non-empty category', () => {
      expect(entry.category.length).toBeGreaterThan(0);
    });

    it('has weight and confidence within [0, 1]', () => {
      expect(entry.weight).toBeGreaterThanOrEqual(0);
      expect(entry.weight).toBeLessThanOrEqual(1);
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    });

    it('has lowercase, non-empty aliases', () => {
      for (const alias of entry.aliases) {
        expect(alias.length, `${entry.keyword} alias "${alias}"`).toBeGreaterThan(0);
        expect(alias, `${entry.keyword} alias "${alias}"`).toBe(alias.toLowerCase());
      }
    });

    it('uses only known hint vocabularies', () => {
      if (entry.relationshipHint) expect(RELATIONSHIP_HINTS.has(entry.relationshipHint)).toBe(true);
      if (entry.queryHint) expect(QUERY_HINTS.has(entry.queryHint)).toBe(true);
      if (entry.actionHint) expect(ACTION_HINTS.has(entry.actionHint)).toBe(true);
    });

    it('provides a surfaceTarget for navigation/authority actions', () => {
      if (entry.actionHint === 'OPEN_SURFACE' || entry.actionHint === 'ENTITY_AUTHORITY') {
        expect(entry.surfaceTarget, `${entry.keyword} needs surfaceTarget`).toBeTruthy();
      }
    });
  });

  it('every keyword resolves via lookupKeyword', () => {
    for (const entry of GLOSSARY) {
      expect(lookupKeyword(entry.keyword), `lookup ${entry.keyword}`).not.toBeNull();
    }
  });

  it('every alias resolves to some entry via lookupKeyword', () => {
    for (const { alias } of glossaryAliases()) {
      expect(lookupKeyword(alias), `lookup alias "${alias}"`).not.toBeNull();
    }
  });

  it('alias index is sorted longest-first (multi-word aliases win)', () => {
    const aliases = glossaryAliases();
    for (let i = 1; i < aliases.length; i++) {
      expect(aliases[i - 1].alias.length).toBeGreaterThanOrEqual(aliases[i].alias.length);
    }
  });

  it('lookup is apostrophe- and case-insensitive', () => {
    // "can't say no" is a people_pleasing alias stored with a straight quote.
    expect(lookupKeyword("CAN'T SAY NO")).not.toBeNull();
    expect(lookupKeyword('Find My')).not.toBeNull();
  });

    describe('STANCE_* entries', () => {
    const stanceEntries = GLOSSARY.filter((e) => e.category.startsWith('STANCE_'));

    it('are non-empty', () => {
      expect(stanceEntries.length).toBeGreaterThan(0);
    });

    it.each(stanceEntries.map((e) => [label(e), e] as const))('%s has stanceForm and subcategory', (_l, entry) => {
      expect(entry.stanceForm, `${entry.keyword} needs stanceForm`).toBeTruthy();
      expect(entry.subcategory, `${entry.keyword} needs subcategory`).toBeTruthy();
      expect(entry.kinshipForm, `${entry.keyword} must not set kinshipForm`).toBeUndefined();
    });

    it('uses PHRASE/VERB only on preference and epistemic layers', () => {
      for (const entry of stanceEntries) {
        if (entry.stanceForm === 'PHRASE' || entry.stanceForm === 'VERB') {
          expect(['STANCE_PREFERENCE', 'STANCE_EPISTEMIC']).toContain(entry.category);
        }
        if (entry.stanceForm === 'EMOTION') {
          expect(entry.category).toBe('STANCE_AFFECT');
        }
      }
    });
  });

  describe('lexical extension entries', () => {
    const social = GLOSSARY.filter((e) => e.category === 'SOCIAL_ROLE');
    const discourse = GLOSSARY.filter((e) => e.category === 'NARRATIVE_DISCOURSE');
    const stages = GLOSSARY.filter((e) => e.category === 'NARRATIVE_STAGE');
    const temporal = GLOSSARY.filter((e) => e.category === 'TEMPORAL_ANCHOR');

    it('SOCIAL_ROLE entries have subcategory and relationshipHint', () => {
      expect(social.length).toBeGreaterThan(0);
      for (const entry of social) {
        expect(entry.subcategory).toBeTruthy();
        expect(entry.relationshipHint).toBe('SOCIAL_RELATIONSHIP');
      }
    });

    it('NARRATIVE_DISCOURSE and NARRATIVE_STAGE entries have subcategory', () => {
      expect(discourse.length).toBeGreaterThan(0);
      expect(stages.length).toBeGreaterThan(0);
      for (const entry of [...discourse, ...stages]) {
        expect(entry.subcategory).toBeTruthy();
      }
    });

    it('TEMPORAL_ANCHOR entries are TIME domain', () => {
      expect(temporal.length).toBeGreaterThan(0);
      for (const entry of temporal) {
        expect(entry.domain).toBe('TIME');
        expect(entry.subcategory).toBeTruthy();
      }
    });
  });
});

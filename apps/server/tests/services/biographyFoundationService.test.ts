/**
 * Biography Trust Recovery — regression suite (Sprint O)
 *
 * Locks in the rule: Biography is a narrator over authoritative data, never
 * an editor of it. `extractBiographyFacts` must reproduce structured facts
 * (relationship status, identity) faithfully — even when raw journal text
 * contains language that *could* be misread as contradicting them.
 *
 * Mirrors the chainable Supabase mock pattern from livingBiographyService.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type TableResult = { data: any; error: any; count?: number };

function makeChain(result: TableResult) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    not: () => chain,
    gt: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, TableResult> = {};

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null, count: 0 })),
  },
}));

import { biographyFoundationService } from '../../src/services/biographyFoundationService';

const USER_ID = 'user-1';
const PROTAGONIST_ID = 'char-protagonist';
const SOL_ID = 'char-sol';
const ABUELA_ID = 'char-abuela';

function baseTables(overrides: Partial<Record<string, TableResult>> = {}) {
  tableResults = {
    journal_entries: {
      data: [
        // co-mentions Sam Chen's breakup AND Grandma Rose in the same entry — the exact
        // cross-contamination scenario that produced the false "ended" claims
        { id: 'e1', content: 'Summer of Setbacks and Heartbreak — no contact with Sam Chen since the breakup, ended things for good. Living with Grandma Rose has been steady through it all.', mood: 'sad', tags: ['heartbreak', 'family'], emotional_intensity: 0.8 },
        { id: 'e2', content: 'Grandma Rose and I went to Costco today, family time as always.', mood: 'content', tags: ['family'], emotional_intensity: 0.3 },
        { id: 'e3', content: 'Still unemployed, prepping for the Northwind Labs interview next week.', mood: 'anxious', tags: ['career'], emotional_intensity: 0.5 },
      ],
      error: null,
    },
    characters: {
      data: [
        { id: PROTAGONIST_ID, name: 'Rene Alvarez', alias: [], metadata: { is_self: true, mention_count: 20 } },
        { id: SOL_ID, name: 'Sam Chen', alias: [], metadata: { mention_count: 5 } },
        { id: ABUELA_ID, name: 'Grandma Rose', alias: [], metadata: { mention_count: 5 } },
      ],
      error: null,
    },
    people_places: {
      data: [{ name: 'Anaheim', type: 'place', total_mentions: 8 }],
      error: null,
    },
    character_relationships: {
      data: [
        {
          id: 'rel-sol',
          source_character_id: PROTAGONIST_ID,
          target_character_id: SOL_ID,
          relationship_type: 'romantic',
          status: 'active',
          metadata: { source_memory_ids: ['e1'] },
        },
        {
          id: 'rel-abuela',
          source_character_id: PROTAGONIST_ID,
          target_character_id: ABUELA_ID,
          relationship_type: 'family',
          status: 'active',
          metadata: { source_memory_ids: ['e1', 'e2'] },
        },
      ],
      error: null,
    },
    character_timeline_events: { data: [], error: null },
    quests: { data: [], error: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  baseTables();
});

describe('extractBiographyFacts — authoritative fact hierarchy (Sprint O)', () => {
  it('1. keeps relationship status "active" even when co-mentioned journal text contains "no contact" / "ended"', async () => {
    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    const sol = facts.relationships.find(r => r.characterId === SOL_ID);
    expect(sol?.status).toBe('active');
  });

  it('2. cannot turn a family relationship into "ended" via cross-contaminated keyword text', async () => {
    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    const abuela = facts.relationships.find(r => r.characterId === ABUELA_ID);
    expect(abuela?.status).toBe('active');
    expect(abuela?.status).not.toBe('ended');
  });

  it('reproduces character_relationships.status verbatim regardless of its value (narrator, not editor)', async () => {
    baseTables({
      character_relationships: {
        data: [
          {
            id: 'rel-sol',
            source_character_id: PROTAGONIST_ID,
            target_character_id: SOL_ID,
            relationship_type: 'romantic',
            status: 'ended', // DB says ended this time — Biography must agree, not "double check"
            metadata: { source_memory_ids: ['e1'] },
          },
        ],
        error: null,
      },
    });

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    const sol = facts.relationships.find(r => r.characterId === SOL_ID);
    expect(sol?.status).toBe('ended');
  });

  it('3. derives employment from explicit content signal only — does not invent a status when absent', async () => {
    baseTables({
      journal_entries: {
        data: [
          { id: 'e1', content: 'Had coffee with Grandma Rose this morning, nothing major going on.', mood: 'calm', tags: [], emotional_intensity: 0.2 },
        ],
        error: null,
      },
    });

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    expect(facts.identity.employment).toBeNull();
  });

  it('3b. employment reflects the explicit signal present in the record — traceable, not fabricated', async () => {
    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    // base fixture explicitly contains "Still unemployed"
    expect(facts.identity.employment).toBe('unemployed');
  });

  it('4. location comes from the structured people_places table — cannot be "relocated" by incidental journal mentions of other places', async () => {
    baseTables({
      journal_entries: {
        data: [
          { id: 'e1', content: 'Dreaming about visiting Tokyo and Paris someday — for now just another day in Anaheim with the family.', mood: 'hopeful', tags: [], emotional_intensity: 0.4 },
        ],
        error: null,
      },
      people_places: {
        data: [{ name: 'Anaheim', type: 'place', total_mentions: 8 }],
        error: null,
      },
    });

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    expect(facts.identity.location).toBe('Anaheim');
    expect(facts.identity.location).not.toBe('Tokyo');
    expect(facts.identity.location).not.toBe('Paris');
  });
});

describe('buildProvenance (via generateBiography output) — traceability (Sprint O)', () => {
  it('marks relationship status as authoritative, sourced from character_relationships.status', async () => {
    // Reach the private buildProvenance through its only call site without
    // invoking the LLM: call extractBiographyFacts then build provenance the
    // same way generateBiography does, by exercising the documented contract.
    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    const provenance = (biographyFoundationService as any).buildProvenance(facts);

    expect(provenance[`relationship.${SOL_ID}.status`]).toEqual({
      value: 'active',
      source: 'character_relationships.status',
      confidence: 'authoritative',
    });
    expect(provenance[`relationship.${ABUELA_ID}.status`].confidence).toBe('authoritative');
  });

  it('marks employment/education/location as inferred — never presented with authoritative confidence', async () => {
    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);
    const provenance = (biographyFoundationService as any).buildProvenance(facts);

    expect(provenance['identity.employment'].confidence).toBe('inferred');
    expect(provenance['identity.education'].confidence).toBe('inferred');
    expect(provenance['identity.location'].confidence).toBe('inferred');
  });
});

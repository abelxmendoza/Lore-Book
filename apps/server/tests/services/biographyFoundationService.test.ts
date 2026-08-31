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
    is: () => chain,
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

vi.mock('../../src/services/chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimeline: vi.fn(async () => ({ items: [], unresolved_items: [] })),
  },
}));

vi.mock('../../src/services/characters/characterEntityTimelineService', () => ({
  buildCanonicalCharacterTimeline: vi.fn(async () => ({
    sharedExperiences: [],
    lore: [],
    unresolved: [],
    summary: {
      firstKnownOccurrenceAt: null,
      lastKnownOccurrenceAt: null,
      firstMentionedAt: null,
      lastMentionedAt: null,
    },
  })),
  emptyCharacterTimelineResult: vi.fn(),
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
    resolved_events: { data: [], error: null },
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

  it('excludes relationships pointing at an archived or reclassified character — they never cascade an "ended" status onto character_relationships, so the edge stays active forever unless filtered here', async () => {
    const DROPPED_ARCHIVED_ID = 'char-dropped-archived';
    const DROPPED_RECLASSIFIED_ID = 'char-dropped-reclassified';
    baseTables({
      characters: {
        data: [
          { id: PROTAGONIST_ID, name: 'Rene Alvarez', alias: [], metadata: { is_self: true, mention_count: 20 } },
          { id: SOL_ID, name: 'Sam Chen', alias: [], metadata: { mention_count: 5 } },
          { id: ABUELA_ID, name: 'Grandma Rose', alias: [], metadata: { mention_count: 5 } },
          // Real production case: a genre reference ("ska") miscategorized as
          // a Character, later reclassified out — but the relationship edge
          // pointing at it was never touched by the reclassify write path.
          { id: DROPPED_RECLASSIFIED_ID, name: 'One Piece', alias: [], metadata: {}, status: 'reclassified' },
          { id: DROPPED_ARCHIVED_ID, name: 'one girl', alias: [], metadata: {}, status: 'archived' },
        ],
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
            metadata: {},
          },
          {
            id: 'rel-dropped-reclassified',
            source_character_id: PROTAGONIST_ID,
            target_character_id: DROPPED_RECLASSIFIED_ID,
            relationship_type: 'acquaintance',
            status: 'active',
            metadata: {},
          },
          {
            id: 'rel-dropped-archived',
            source_character_id: DROPPED_ARCHIVED_ID,
            target_character_id: PROTAGONIST_ID,
            relationship_type: 'acquaintance',
            status: 'active',
            metadata: {},
          },
        ],
        error: null,
      },
    });

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    expect(facts.relationships.find(r => r.characterId === SOL_ID)).toBeDefined();
    expect(facts.relationships.find(r => r.characterId === DROPPED_RECLASSIFIED_ID)).toBeUndefined();
    expect(facts.relationships.find(r => r.characterId === DROPPED_ARCHIVED_ID)).toBeUndefined();
    expect(facts.relationships.some(r => r.name === 'One Piece')).toBe(false);
    expect(facts.relationships.some(r => r.name === 'one girl')).toBe(false);
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

  it('uses temporal.occurred.start for life periods and does not promote unresolved recorded time', async () => {
    const { stitchedTimelineService } = await import('../../src/services/chronologyV2/stitchedTimelineService');
    vi.mocked(stitchedTimelineService.getStitchedTimeline).mockResolvedValueOnce({
      items: [
        {
          title: 'Known occurrence',
          occurrenceStatus: 'confirmed',
          canonicalEventType: 'milestone',
          sourceType: 'resolved_event',
          occurredAt: null,
          sortTime: '1970-01-01T00:00:00.000Z',
          temporal: {
            occurred: { start: '2024-06-15T00:00:00.000Z', status: 'anchored' },
            recordedAt: '2026-08-21T12:00:00.000Z',
          },
        },
        {
          title: 'Unresolved occurrence',
          occurrenceStatus: 'unresolved',
          canonicalEventType: 'milestone',
          sourceType: 'resolved_event',
          occurredAt: '2026-08-21T00:00:00.000Z',
          sortTime: '2026-08-21T00:00:00.000Z',
          temporal: {
            occurred: { start: null, status: 'unanchored' },
            recordedAt: '2026-08-21T12:00:00.000Z',
          },
        },
      ],
    } as never);

    const periods = await biographyFoundationService.identifyLifePeriods(USER_ID);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.label).toBe('Jun 2024');
    expect(periods[0]?.startDate).toBe('2024-06-01');
    expect(periods[0]?.eventCount).toBe(1);
  });
});

describe('keyEvents — recording-time fallback for undated activity', () => {
  it('flags occurrence-dated events dateIsOccurrence: true and undated-but-recorded events dateIsOccurrence: false', async () => {
    const { buildCanonicalCharacterTimeline } = await import('../../src/services/characters/characterEntityTimelineService');
    vi.mocked(buildCanonicalCharacterTimeline).mockResolvedValueOnce({
      sharedExperiences: [
        {
          eventTitle: 'Dated Event', eventType: 'career_milestone', timelineType: 'shared_experience',
          occurredStart: '2026-06-01T00:00:00.000Z', confidence: 0.8, connectionCharacter: null,
          isUnresolved: false, legacyOnly: false, recordedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      lore: [],
      unresolved: [
        {
          eventTitle: 'Undated Recent Event', eventType: 'nightlife_event', timelineType: 'lore',
          occurredStart: null, confidence: 0.7, connectionCharacter: null,
          isUnresolved: true, recordedAt: '2026-08-20T00:00:00.000Z',
        },
        // No recordedAt at all — must never fabricate a date, so this is dropped entirely.
        {
          eventTitle: 'Undated No RecordedAt', eventType: 'lore', timelineType: 'lore',
          occurredStart: null, confidence: 0.5, connectionCharacter: null,
          isUnresolved: true, recordedAt: null,
        },
      ],
      legacyOnly: [],
      summary: { lastInteractionAt: null, lastInteractionId: null, lastMentionedAt: null, lastMentionedId: null, firstKnownAppearanceAt: null, firstKnownAppearanceId: null, firstKnownOccurrenceAt: null, firstKnownOccurrenceId: null, lastKnownOccurrenceAt: null, lastKnownOccurrenceId: null, firstMentionedAt: null, firstMentionedId: null },
    } as never);

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    const dated = facts.keyEvents.find(e => e.title === 'Dated Event');
    expect(dated?.dateIsOccurrence).toBe(true);
    expect(dated?.date).toBe('2026-06-01T00:00:00.000Z');

    const undated = facts.keyEvents.find(e => e.title === 'Undated Recent Event');
    expect(undated?.dateIsOccurrence).toBe(false);
    expect(undated?.date).toBe('2026-08-20T00:00:00.000Z');

    expect(facts.keyEvents.find(e => e.title === 'Undated No RecordedAt')).toBeUndefined();
  });

  it('caps the recording-time fallback and orders it newest-recorded-first', async () => {
    const { buildCanonicalCharacterTimeline } = await import('../../src/services/characters/characterEntityTimelineService');
    const unresolved = Array.from({ length: 15 }, (_, i) => ({
      eventTitle: `Event ${i}`, eventType: 'lore', timelineType: 'lore',
      occurredStart: null, confidence: 0.5, connectionCharacter: null,
      isUnresolved: true, recordedAt: new Date(Date.UTC(2026, 7, i + 1)).toISOString(),
    }));
    vi.mocked(buildCanonicalCharacterTimeline).mockResolvedValueOnce({
      sharedExperiences: [], lore: [], unresolved, legacyOnly: [],
      summary: { lastInteractionAt: null, lastInteractionId: null, lastMentionedAt: null, lastMentionedId: null, firstKnownAppearanceAt: null, firstKnownAppearanceId: null, firstKnownOccurrenceAt: null, firstKnownOccurrenceId: null, lastKnownOccurrenceAt: null, lastKnownOccurrenceId: null, firstMentionedAt: null, firstMentionedId: null },
    } as never);

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    expect(facts.keyEvents).toHaveLength(10);
    expect(facts.keyEvents[0]?.title).toBe('Event 14');
    expect(facts.keyEvents.every(e => e.dateIsOccurrence === false)).toBe(true);
  });
});

describe('keyEvents — unpromoted Scene fallback (real recent life content stuck below the Event-significance bar)', () => {
  it('folds in recent unpromoted scenes not already covered by canonical events', async () => {
    tableResults.narrative_scenes = {
      data: [
        { title: 'Went to the club last night', time_start: '2026-08-25T02:17:28.684Z', created_at: '2026-08-25T02:18:11.753Z', promoted_event_id: null },
        { title: 'Met her at the afters', time_start: null, created_at: '2026-08-25T01:49:45.021Z', promoted_event_id: null },
      ],
      error: null,
    };

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    const clubScene = facts.keyEvents.find(e => e.title === 'Went to the club last night');
    expect(clubScene?.eventType).toBe('scene');
    expect(clubScene?.dateIsOccurrence).toBe(true);
    expect(clubScene?.date).toBe('2026-08-25T02:17:28.684Z');

    const aftersScene = facts.keyEvents.find(e => e.title === 'Met her at the afters');
    expect(aftersScene?.dateIsOccurrence).toBe(false);
    expect(aftersScene?.date).toBe('2026-08-25T01:49:45.021Z');
  });

  it('does not duplicate a scene whose title already appears as a canonical event', async () => {
    const { buildCanonicalCharacterTimeline } = await import('../../src/services/characters/characterEntityTimelineService');
    vi.mocked(buildCanonicalCharacterTimeline).mockResolvedValueOnce({
      sharedExperiences: [
        {
          eventTitle: 'Went to the club last night', eventType: 'nightlife_event', timelineType: 'shared_experience',
          occurredStart: '2026-08-25T02:17:28.684Z', confidence: 0.8, connectionCharacter: null,
          isUnresolved: false, legacyOnly: false, recordedAt: '2026-08-25T02:17:28.684Z',
        },
      ],
      lore: [], unresolved: [], legacyOnly: [],
      summary: { lastInteractionAt: null, lastInteractionId: null, lastMentionedAt: null, lastMentionedId: null, firstKnownAppearanceAt: null, firstKnownAppearanceId: null, firstKnownOccurrenceAt: null, firstKnownOccurrenceId: null, lastKnownOccurrenceAt: null, lastKnownOccurrenceId: null, firstMentionedAt: null, firstMentionedId: null },
    } as never);
    tableResults.narrative_scenes = {
      data: [
        { title: 'Went to the club last night', time_start: '2026-08-25T02:17:28.684Z', created_at: '2026-08-25T02:18:11.753Z', promoted_event_id: 'evt-1' },
      ],
      error: null,
    };

    const facts = await biographyFoundationService.extractBiographyFacts(USER_ID);

    expect(facts.keyEvents.filter(e => e.title === 'Went to the club last night')).toHaveLength(1);
  });
});

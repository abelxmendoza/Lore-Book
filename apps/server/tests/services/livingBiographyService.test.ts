import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BiographyOutput } from '../../src/services/biographyFoundationService';

// ── Chainable Supabase mock (mirrors recallQueryRouter.test.ts pattern) ───────

type TableResult = { data: any; error: any; count?: number };

function makeChain(result: TableResult) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    not: () => chain,
    gt: () => chain,
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

const { getBiography, generateBiography } = vi.hoisted(() => ({
  getBiography: vi.fn(),
  generateBiography: vi.fn(),
}));

vi.mock('../../src/services/biographyFoundationService', async () => {
  const actual = await vi.importActual<any>('../../src/services/biographyFoundationService');
  return {
    ...actual,
    biographyFoundationService: { getBiography, generateBiography },
  };
});

import {
  getLivingBiographyCard,
  deriveCurrentChapter,
  shouldRefreshBiography,
  getBiographyChanges,
} from '../../src/services/livingBiographyService';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBio(overrides: Partial<BiographyOutput> = {}): BiographyOutput {
  return {
    facts: {
      identity: { name: 'Abel Mendoza', location: 'Los Angeles', education: null, employment: null, sourceEntryIds: [] },
      relationships: [
        { name: 'Abuela', type: 'family', status: 'active', characterId: 'c1', relationshipId: 'r1', sourceMemoryIds: ['m1', 'm2', 'm3'] },
        { name: 'Sol', type: 'partner', status: 'active', characterId: 'c2', relationshipId: 'r2', sourceMemoryIds: ['m4', 'm5'] },
        { name: 'Old Friend', type: 'friend', status: 'ended', characterId: 'c3', relationshipId: 'r3', sourceMemoryIds: ['m6'] },
      ],
      keyEvents: [
        { title: 'Started at LoreBook', eventType: 'career_event', date: '2026-05-01', connection: null, confidence: 0.9, sourceEntryIds: [] },
        { title: 'Moved in with Abuela', eventType: 'living_event', date: '2026-04-01', connection: 'Abuela', confidence: 0.9, sourceEntryIds: [] },
      ],
      livingSituation: 'Living with Abuela',
      upcomingEvents: ['Preparing for Epirus interview'],
      sourceEntryCount: 42,
    },
    themes: [
      { theme: 'career rebuilding', evidence: ['e1', 'e2'], frequency: 5 },
      { theme: 'family closeness', evidence: ['e3'], frequency: 3 },
    ],
    periods: [
      { label: 'Early 2026', startDate: '2026-01-01', endDate: '2026-03-31', eventCount: 4, dominantTheme: 'job searching' },
      { label: 'Spring 2026', startDate: '2026-04-01', endDate: '2026-06-01', eventCount: 6, dominantTheme: 'career rebuilding' },
    ],
    snapshot: 'Abel has been rebuilding his career...',
    snapshotWordCount: 120,
    generatedAt: '2026-06-01T00:00:00.000Z',
    sourceEntryIds: [],
    timelineEventIds: [],
    characterIds: ['c1', 'c2', 'c3'],
    relationshipIds: ['r1', 'r2', 'r3'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tableResults = {};
});

// ── Card projection ───────────────────────────────────────────────────────────

describe('getLivingBiographyCard', () => {
  it('returns hasEnoughData: false with nulls when no biography exists yet', async () => {
    getBiography.mockResolvedValue(null);

    const card = await getLivingBiographyCard('user-1');

    expect(card.hasEnoughData).toBe(false);
    expect(card.name).toBeNull();
    expect(card.currentChapter).toBeNull();
    expect(card.topThemes).toEqual([]);
    expect(card.keyPeople).toEqual([]);
  });

  it('projects the card from the existing biography snapshot — never invents data', async () => {
    const bio = makeBio();
    getBiography.mockResolvedValue(bio);
    tableResults.journal_entries = { data: [], error: null, count: 0 };
    tableResults.character_timeline_events = { data: [], error: null, count: 0 };

    const card = await getLivingBiographyCard('user-1');

    expect(card.hasEnoughData).toBe(true);
    expect(card.name).toBe('Abel Mendoza');
    expect(card.topThemes).toEqual(['career rebuilding', 'family closeness']);
    expect(card.currentFocus).toEqual(['Preparing for Epirus interview']);
    expect(card.lastUpdated).toBe(bio.generatedAt);
  });

  it('excludes ended relationships and ranks key people by evidence strength', async () => {
    const bio = makeBio();
    getBiography.mockResolvedValue(bio);
    tableResults.journal_entries = { data: [], error: null, count: 0 };
    tableResults.character_timeline_events = { data: [], error: null, count: 0 };

    const card = await getLivingBiographyCard('user-1');

    const names = card.keyPeople.map(p => p.name);
    expect(names).toEqual(['Abuela', 'Sol']);
    expect(names).not.toContain('Old Friend');
  });

  it('orders recent developments newest-first from key events', async () => {
    const bio = makeBio();
    getBiography.mockResolvedValue(bio);
    tableResults.journal_entries = { data: [], error: null, count: 0 };
    tableResults.character_timeline_events = { data: [], error: null, count: 0 };

    const card = await getLivingBiographyCard('user-1');

    expect(card.recentDevelopments[0]).toContain('Started at LoreBook');
    expect(card.recentDevelopments[1]).toContain('Moved in with Abuela (with Abuela)');
  });
});

// ── Life chapter detection ────────────────────────────────────────────────────

describe('deriveCurrentChapter', () => {
  it('prefers the most recent life period dominant theme, transformed — not invented', () => {
    const bio = makeBio();

    const chapter = deriveCurrentChapter(bio);

    expect(chapter?.label).toBe('Career Rebuilding Era');
    expect(chapter?.evidence[0]).toContain('Spring 2026');
  });

  it('does not double-suffix a theme that already reads like a chapter label', () => {
    const bio = makeBio({
      periods: [
        { label: 'Now', startDate: '2026-05-01', endDate: '2026-06-01', eventCount: 2, dominantTheme: 'Active Family Period' },
      ],
    });

    const chapter = deriveCurrentChapter(bio);

    expect(chapter?.label).toBe('Active Family Period');
    expect(chapter?.label).not.toContain('Era Era');
  });

  it('falls back to the strongest recurring theme when no period has a dominant theme', () => {
    const bio = makeBio({
      periods: [
        { label: 'Now', startDate: '2026-05-01', endDate: '2026-06-01', eventCount: 2, dominantTheme: null as any },
      ],
    });

    const chapter = deriveCurrentChapter(bio);

    expect(chapter?.label).toBe('Career Rebuilding Era');
    expect(chapter?.evidence).toEqual(['e1', 'e2']);
  });

  it('returns null when there is no period or theme evidence to draw from', () => {
    const bio = makeBio({ periods: [], themes: [] });

    expect(deriveCurrentChapter(bio)).toBeNull();
  });
});

// ── Auto-refresh thresholds ───────────────────────────────────────────────────

describe('shouldRefreshBiography', () => {
  it('does not refresh within the minimum cooldown window, regardless of new evidence', async () => {
    const recent = new Date(Date.now() - 1 * 3_600_000).toISOString();
    tableResults.journal_entries = { data: [], error: null, count: 99 };
    tableResults.character_timeline_events = { data: [], error: null, count: 99 };

    expect(await shouldRefreshBiography('user-1', recent)).toBe(false);
  });

  it('refreshes once the cooldown has passed and enough new journal entries exist', async () => {
    const stale = new Date(Date.now() - 48 * 3_600_000).toISOString();
    tableResults.journal_entries = { data: [], error: null, count: 5 };
    tableResults.character_timeline_events = { data: [], error: null, count: 0 };

    expect(await shouldRefreshBiography('user-1', stale)).toBe(true);
  });

  it('refreshes once the cooldown has passed and enough new timeline events exist', async () => {
    const stale = new Date(Date.now() - 48 * 3_600_000).toISOString();
    tableResults.journal_entries = { data: [], error: null, count: 0 };
    tableResults.character_timeline_events = { data: [], error: null, count: 3 };

    expect(await shouldRefreshBiography('user-1', stale)).toBe(true);
  });

  it('does not refresh past cooldown when neither threshold is met', async () => {
    const stale = new Date(Date.now() - 48 * 3_600_000).toISOString();
    tableResults.journal_entries = { data: [], error: null, count: 1 };
    tableResults.character_timeline_events = { data: [], error: null, count: 1 };

    expect(await shouldRefreshBiography('user-1', stale)).toBe(false);
  });
});

// ── Change tracking ───────────────────────────────────────────────────────────

describe('getBiographyChanges', () => {
  it('returns no changes when there is no biography yet', async () => {
    getBiography.mockResolvedValue(null);

    expect(await getBiographyChanges('user-1', '2026-01-01T00:00:00.000Z')).toEqual([]);
  });

  it('flags a new chapter, new milestones, and new people that postdate the cutoff', async () => {
    const bio = makeBio();
    getBiography.mockResolvedValue(bio);
    const since = '2026-03-01T00:00:00.000Z';
    tableResults.characters = { data: [{ name: 'Sol', created_at: '2026-04-15T00:00:00.000Z' }], error: null };
    tableResults.journal_entries = { data: [], error: null };

    const changes = await getBiographyChanges('user-1', since);

    expect(changes).toContainEqual({ kind: 'new_chapter', label: 'New life chapter: Career Rebuilding Era' });
    expect(changes).toContainEqual({ kind: 'new_milestone', label: 'New milestone: Started at LoreBook' });
    expect(changes).toContainEqual({ kind: 'new_milestone', label: 'New milestone: Moved in with Abuela' });
    expect(changes).toContainEqual({ kind: 'new_person', label: 'New important person: Sol' });
  });

  it('does not flag chapters or milestones that predate the cutoff', async () => {
    const bio = makeBio();
    getBiography.mockResolvedValue(bio);
    const since = '2026-12-01T00:00:00.000Z'; // after everything in the fixture
    tableResults.characters = { data: [], error: null };
    tableResults.journal_entries = { data: [], error: null };

    const changes = await getBiographyChanges('user-1', since);

    expect(changes.some(c => c.kind === 'new_chapter')).toBe(false);
    expect(changes.some(c => c.kind === 'new_milestone')).toBe(false);
  });

  it('flags an emerging theme only when all of its evidence postdates the cutoff', async () => {
    const bio = makeBio({
      themes: [{ theme: 'new beginnings', evidence: ['e10'], frequency: 1 }],
      periods: [],
      facts: { ...makeBio().facts, keyEvents: [] },
    });
    getBiography.mockResolvedValue(bio);
    const since = '2026-05-01T00:00:00.000Z';
    tableResults.characters = { data: [], error: null };
    tableResults.journal_entries = { data: [{ id: 'e10', date: '2026-05-15T00:00:00.000Z' }], error: null };

    const changes = await getBiographyChanges('user-1', since);

    expect(changes).toContainEqual({ kind: 'emerging_theme', label: 'New theme detected: new beginnings' });
  });

  it('does not flag a theme as emerging when any of its evidence predates the cutoff', async () => {
    const bio = makeBio({
      themes: [{ theme: 'long-running theme', evidence: ['e20'], frequency: 1 }],
      periods: [],
      facts: { ...makeBio().facts, keyEvents: [] },
    });
    getBiography.mockResolvedValue(bio);
    const since = '2026-05-01T00:00:00.000Z';
    tableResults.characters = { data: [], error: null };
    tableResults.journal_entries = { data: [{ id: 'e20', date: '2026-01-01T00:00:00.000Z' }], error: null };

    const changes = await getBiographyChanges('user-1', since);

    expect(changes.some(c => c.kind === 'emerging_theme')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { resolveMention, wouldCreateCharacter, type ResolutionCandidate } from '../../src/services/entities/entityResolutionCore';
import { segmentEpisodes, type SegMessage } from '../../src/services/conversationCentered/episodeSegmentationCore';
import { emptyThreadMetadata, mergeThreadMetadata, buildContinuityCard } from '../../src/services/conversationCentered/threadIntelligenceService';

const abuela: ResolutionCandidate = { id: 'e-abuela', name: 'Abuela', aliases: ['grandma', 'Abuelita'], type: 'person', mentions: 18, lastMentionedAt: new Date().toISOString() };
const tioJuan: ResolutionCandidate = { id: 'e-tiojuan', name: 'Tío Juan', aliases: ['Juan'], type: 'person', mentions: 12, relatedEntityIds: ['e-abuela'] };
const oscuriJuan: ResolutionCandidate = { id: 'e-oscuri', name: 'Juan', aliases: [], type: 'person', mentions: 3, relatedEntityIds: ['e-club'] };

describe('Entity Resolution Core — lore-aware (never duplicate a known entity)', () => {
  it('"grandma" resolves to the existing Abuela via kinship/alias', () => {
    const r = resolveMention('grandma', [abuela]);
    expect(r.action).toBe('resolve');
    expect(r.resolvedId).toBe('e-abuela');
  });

  it('does NOT create a new character when a high-confidence existing entity matches', () => {
    expect(wouldCreateCharacter('grandma', [abuela])).toBe(false);
    expect(wouldCreateCharacter('Abuelita', [abuela])).toBe(false);
  });

  it('exact + alias match resolve confidently', () => {
    expect(resolveMention('Abuela', [abuela]).action).toBe('resolve');
    expect(resolveMention('Abuelita', [abuela]).action).toBe('resolve');
  });
});

describe('Entity Resolution Core — context-aware disambiguation ("which Juan")', () => {
  it('two Juans with no context → disambiguate (ask, do not guess)', () => {
    const r = resolveMention('Juan', [tioJuan, oscuriJuan]);
    expect(r.action).toBe('disambiguate');
    expect(r.ranked).toHaveLength(2);
  });

  it('thread context (Tío Juan active) → resolves to Tío Juan, not the other', () => {
    const r = resolveMention('Juan', [tioJuan, oscuriJuan], { threadEntityIds: ['e-tiojuan'] });
    expect(r.action).toBe('resolve');
    expect(r.resolvedId).toBe('e-tiojuan');
  });

  it('relationship overlap with the thread breaks ties', () => {
    // Abuela is active in the thread; Tío Juan is related to Abuela → favoured.
    const r = resolveMention('Juan', [tioJuan, oscuriJuan], { threadEntityIds: ['e-abuela'] });
    expect(r.resolvedId).toBe('e-tiojuan');
  });
});

describe('Entity Resolution Core — create vs skip', () => {
  it('a classifiable new person (with evidence) and no candidate → create', () => {
    expect(resolveMention('Tío Ralph', []).action).toBe('create');
  });
  it('an unknown bare proper noun with no candidate → skip (requires evidence)', () => {
    expect(resolveMention('Zephyrine', []).action).toBe('skip');
  });
  it('a product mention never creates a character', () => {
    expect(wouldCreateCharacter('High Noon', [])).toBe(false);
  });
});

describe('Entity Resolution Core — Phase 8 duplicate prevention (production examples)', () => {
  it('Juan vs Tío Juan: ambiguous → merge_suggestion; thread context → auto_resolve', () => {
    expect(resolveMention('Juan', [tioJuan, oscuriJuan]).recommendation).toBe('merge_suggestion');
    expect(resolveMention('Juan', [tioJuan, oscuriJuan], { threadEntityIds: ['e-tiojuan'] }).recommendation).toBe('auto_resolve');
  });

  it('Abuela vs Grandma: kinship-equivalent → auto_resolve (no duplicate)', () => {
    const r = resolveMention('Grandma', [abuela]);
    expect(r.recommendation).toBe('auto_resolve');
    expect(r.resolvedId).toBe('e-abuela');
  });

  it('Mom vs Mother: kinship-equivalent → resolves to the existing entity', () => {
    const mother: ResolutionCandidate = { id: 'e-mom', name: 'Mother', aliases: [], type: 'person', mentions: 9 };
    const r = resolveMention('Mom', [mother]);
    expect(r.resolvedId).toBe('e-mom');
    expect(r.recommendation).toBe('auto_resolve');
  });

  it('Daisy vs Hell Fairy: resolves only when Daisy is a known alias (no false merge)', () => {
    const hellFairy: ResolutionCandidate = { id: 'e-hf', name: 'Hell Fairy', aliases: ['Daisy'], type: 'person', mentions: 7 };
    expect(resolveMention('Daisy', [hellFairy]).resolvedId).toBe('e-hf'); // aliased → resolve
    // Without the alias, "Daisy" must NOT merge into Hell Fairy (different name).
    const hellFairyNoAlias: ResolutionCandidate = { id: 'e-hf2', name: 'Hell Fairy', aliases: [], type: 'person', mentions: 7 };
    expect(resolveMention('Daisy', [hellFairyNoAlias]).resolvedId).toBeNull(); // no false merge
    // With person evidence and no match, it becomes a separate entity.
    expect(resolveMention('Daisy', [hellFairyNoAlias], { now: Date.now() }).recommendation).not.toBe('auto_resolve');
  });

  it('the three tiers: high→auto_resolve, medium→merge_suggestion, low→create_separate', () => {
    expect(resolveMention('Abuela', [abuela]).recommendation).toBe('auto_resolve');          // exact, single
    expect(resolveMention('Juan', [tioJuan, oscuriJuan]).recommendation).toBe('merge_suggestion'); // ambiguous
    expect(resolveMention('Tío Ralph', []).recommendation).toBe('create_separate');          // no match
  });
});

// ── Episode segmentation ──────────────────────────────────────────────────────
const at = (h: number) => new Date(2026, 5, 1, h, 0, 0).toISOString();
const msg = (id: string, content: string, hour: number, entityIds: string[] = [], locationIds: string[] = []): SegMessage =>
  ({ id, role: 'user', content, created_at: at(hour), entityIds, locationIds });

describe('Episode Segmentation — splits a thread into episodes', () => {
  it('a continuous burst on one topic → one episode', () => {
    const eps = segmentEpisodes([
      msg('1', 'building lorebook memory features all afternoon', 13, ['p-lorebook']),
      msg('2', 'fixed the lorebook recall bug finally', 13, ['p-lorebook']),
    ]);
    expect(eps).toHaveLength(1);
  });

  it('a large time gap starts a new episode', () => {
    const eps = segmentEpisodes([
      msg('1', 'morning coding session on lorebook', 9, ['p-lorebook']),
      msg('2', 'went clubbing at metro that night', 22, ['l-clubmetro'], ['l-clubmetro']),
    ]);
    expect(eps.length).toBe(2);
    expect(eps[1].boundaryReason).toContain('time-gap');
  });

  it('an entity + location shift starts a new episode', () => {
    const eps = segmentEpisodes([
      msg('1', 'costco trip with abuela buying groceries', 12, ['e-abuela'], ['l-costco']),
      msg('2', 'costco was packed and abuela wanted churros', 12, ['e-abuela'], ['l-costco']),
      msg('3', 'later amazon hiring interview went well downtown', 13, ['o-amazon'], ['l-downtown']),
    ], { timeGapMs: 6 * 60 * 60 * 1000 });
    expect(eps.length).toBe(2);
    expect(eps[0].participants).toContain('e-abuela');
    expect(eps[1].participants).toContain('o-amazon');
  });

  it('empty input → no episodes', () => {
    expect(segmentEpisodes([])).toHaveLength(0);
  });
});

describe('Thread Intelligence — incremental metadata (Phase 2)', () => {
  it('folds turns in incrementally (set-union, counters bump), no full scan', () => {
    let meta = emptyThreadMetadata();
    meta = mergeThreadMetadata(meta, { people: ['Abuela'], places: ['Costco'], at: '2026-06-01T12:00:00Z' });
    meta = mergeThreadMetadata(meta, { people: ['Abuela', 'Tío Juan'], projects: ['LoreBook'], episodeId: 'ep-1', at: '2026-06-01T13:00:00Z' });
    expect(meta.people.sort()).toEqual(['Abuela', 'Tío Juan']); // de-duped union
    expect(meta.places).toEqual(['Costco']);
    expect(meta.projects).toEqual(['LoreBook']);
    expect(meta.episodes).toEqual(['ep-1']);
    expect(meta.message_count).toBe(2);
    expect(meta.last_activity).toBe('2026-06-01T13:00:00Z'); // latest wins
  });

  it('does not regress last_activity on an out-of-order older turn', () => {
    let meta = mergeThreadMetadata(emptyThreadMetadata(), { at: '2026-06-05T00:00:00Z' });
    meta = mergeThreadMetadata(meta, { at: '2026-06-01T00:00:00Z' });
    expect(meta.last_activity).toBe('2026-06-05T00:00:00Z');
  });
});

describe('Thread Intelligence — continuity card (Phase 3, deterministic)', () => {
  const now = new Date('2026-06-05T00:00:00Z').getTime();
  it('renders "Last time in this thread" from metadata, omitting empty sections', () => {
    const meta = { ...emptyThreadMetadata(), people: ['Abuela', 'Tío Juan'], projects: ['LoreBook'], places: ['Costco'], episodes: ['Costco With Abuela'], last_activity: '2026-06-02T00:00:00Z' };
    const card = buildContinuityCard(meta, { now });
    expect(card).toContain('Last time in this thread (3 days ago):');
    expect(card).toContain('People: Abuela, Tío Juan');
    expect(card).toContain('Projects: LoreBook');
    expect(card).toContain('Recent events: Costco With Abuela');
    expect(card).not.toContain('Themes:'); // empty section omitted
  });

  it('empty metadata → empty card (never a hollow "Last time" with nothing)', () => {
    expect(buildContinuityCard(emptyThreadMetadata(), { now })).toBe('');
  });

  it('open loops surface when provided', () => {
    const meta = { ...emptyThreadMetadata(), people: ['Sol'], last_activity: '2026-06-04T00:00:00Z' };
    const card = buildContinuityCard(meta, { now, openLoops: ['1 message awaiting a reply'] });
    expect(card).toContain('Open loops: 1 message awaiting a reply');
  });
});

import { describe, expect, it } from 'vitest';

import { resolveMention, wouldCreateCharacter, type ResolutionCandidate } from '../../src/services/entities/entityResolutionCore';
import { segmentEpisodes, type SegMessage } from '../../src/services/conversationCentered/episodeSegmentationCore';

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

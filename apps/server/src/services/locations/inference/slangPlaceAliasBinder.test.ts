import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  SlangPlaceAliasBinder,
  extractAnnualRecurrence,
  type SlangBinderDeps,
} from './slangPlaceAliasBinder';

type EventRow = Awaited<ReturnType<SlangBinderDeps['loadEvents']>>[number];
type LocationRow = Awaited<ReturnType<SlangBinderDeps['loadLocations']>>[number];

function makeDeps(events: EventRow[], locations: LocationRow[]) {
  const deps: SlangBinderDeps = {
    loadEvents: vi.fn(async () => events),
    loadLocations: vi.fn(async () => locations),
    updateEventMetadata: vi.fn(async (_u, id, metadata) => {
      const row = events.find((e) => e.id === id);
      if (row) row.metadata = metadata;
    }),
    updateLocation: vi.fn(async (_u, id, patch) => {
      const row = locations.find((l) => l.id === id);
      if (row) {
        row.metadata = patch.metadata;
        if (patch.aliases) row.aliases = patch.aliases;
      }
    }),
    deleteLocation: vi.fn(async () => {}),
  };
  return deps;
}

const USER = 'user-1';

let animeExpo: EventRow;
let conventionCenter: LocationRow;

beforeEach(() => {
  animeExpo = {
    id: 'ev-ax',
    title: 'Anime Expo',
    summary: 'Anime convention at the LA Convention Center every 4th of July.',
    tags: ['anime', 'convention'],
    start_time: '2026-07-04T18:00:00Z',
    metadata: {},
    updated_at: '2026-07-05T00:00:00Z',
  };
  conventionCenter = {
    id: 'loc-lacc',
    name: 'LA Convention Center',
    aliases: [],
    summary: 'Downtown LA venue.',
    metadata: {},
    updated_at: '2026-07-05T00:00:00Z',
  };
});

describe('extractAnnualRecurrence', () => {
  it('parses "every 4th of July"', () => {
    expect(extractAnnualRecurrence('It takes place every 4th of July downtown')).toEqual({ month: 7, day: 4 });
  });

  it('parses "every July 4th"', () => {
    expect(extractAnnualRecurrence('happens every July 4th')).toEqual({ month: 7, day: 4 });
  });

  it('falls back to a mid-month anchor for "every July"', () => {
    expect(extractAnnualRecurrence('the con runs every july')).toEqual({ month: 7, day: 15 });
  });

  it('returns null without recurrence language', () => {
    expect(extractAnnualRecurrence('a great convention downtown')).toBeNull();
  });
});

describe('resolveCandidate', () => {
  it('binds "Weeb City" from a July-4th tweet as an Anime Expo alias with tweet provenance and photo', async () => {
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);

    const result = await binder.resolveCandidate(USER, 'Weeb City', {
      evidence: 'back in weeb city for the weekend',
      sourceDate: '2026-07-04T20:00:00Z',
      sourceRef: {
        source: 'x_post',
        url: 'https://x.com/abel/status/123',
        entryId: 'entry-1',
        excerpt: 'back in weeb city for the weekend',
        at: '2026-07-04T20:00:00Z',
      },
      media: [
        {
          url: 'https://pbs.twimg.com/media/ax.jpg',
          type: 'photo',
          alt: 'me at the convention center',
          source: 'x_post',
          sourceUrl: 'https://x.com/abel/status/123',
          entryId: 'entry-1',
        },
      ],
    });

    expect(result.bound).toBe(true);
    expect(result.targetKind).toBe('event');
    expect(result.targetName).toBe('Anime Expo');

    const meta = animeExpo.metadata as Record<string, unknown>;
    expect(meta.aliases).toContain('Weeb City');
    const aliasSources = meta.alias_sources as Array<Record<string, unknown>>;
    expect(aliasSources[0].url).toBe('https://x.com/abel/status/123');
    const media = meta.media as Array<Record<string, unknown>>;
    expect(media[0].url).toBe('https://pbs.twimg.com/media/ax.jpg');
  });

  it('records only mention provenance when the alias is already known', async () => {
    animeExpo.metadata = { aliases: ['Weeb City'] };
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);

    const result = await binder.resolveCandidate(USER, 'weeb city', {
      sourceRef: { source: 'chat', threadId: 'thread-9', excerpt: 'heading to weeb city again', at: '2026-08-01T00:00:00Z' },
    });

    expect(result.bound).toBe(true);
    const sources = (animeExpo.metadata as Record<string, unknown>).sources as Array<Record<string, unknown>>;
    expect(sources).toHaveLength(1);
    expect(sources[0].thread_id).toBe('thread-9');
    // Alias list unchanged — no duplicate registration.
    expect((animeExpo.metadata as Record<string, unknown>).aliases).toEqual(['Weeb City']);
  });

  it('deduplicates repeated mentions from the same source', async () => {
    animeExpo.metadata = { aliases: ['Weeb City'] };
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);

    const ref = { source: 'x_post' as const, url: 'https://x.com/abel/status/123', excerpt: 'weeb city!' };
    await binder.resolveCandidate(USER, 'Weeb City', { sourceRef: ref });
    await binder.resolveCandidate(USER, 'Weeb City', { sourceRef: ref });

    const sources = (animeExpo.metadata as Record<string, unknown>).sources as Array<Record<string, unknown>>;
    expect(sources).toHaveLength(1);
  });

  it('does not bind names that are not slang toponyms', async () => {
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);
    const result = await binder.resolveCandidate(USER, 'Kansas City', { sourceDate: '2026-07-04T00:00:00Z' });
    expect(result.bound).toBe(false);
    expect(deps.updateEventMetadata).not.toHaveBeenCalled();
  });
});

describe('reconcileExistingSlangPlaceCards', () => {
  it('folds a pre-existing "Weeb City" place card into Anime Expo and deletes the card', async () => {
    const weebCityCard: LocationRow = {
      id: 'loc-weeb',
      name: 'Weeb City',
      aliases: [],
      summary: null,
      metadata: {
        context: 'photographed in weeb city',
        first_seen_at: '2026-07-04T20:00:00Z',
        sources: [{ source: 'x_post', url: 'https://x.com/abel/status/123', at: '2026-07-04T20:00:00Z' }],
        media: [{ url: 'https://pbs.twimg.com/media/ax.jpg', type: 'photo', source: 'x_post' }],
      },
      updated_at: '2026-07-04T21:00:00Z',
    };
    const deps = makeDeps([animeExpo], [conventionCenter, weebCityCard]);
    const binder = new SlangPlaceAliasBinder(deps);

    const { reconciled } = await binder.reconcileExistingSlangPlaceCards(USER);

    expect(reconciled).toBe(1);
    expect(deps.deleteLocation).toHaveBeenCalledWith(USER, 'loc-weeb');

    const meta = animeExpo.metadata as Record<string, unknown>;
    expect(meta.aliases).toContain('Weeb City');
    // Provenance and photos migrated to the event.
    const sources = meta.sources as Array<Record<string, unknown>>;
    expect(sources.some((s) => s.url === 'https://x.com/abel/status/123')).toBe(true);
    const media = meta.media as Array<Record<string, unknown>>;
    expect(media.some((m) => m.url === 'https://pbs.twimg.com/media/ax.jpg')).toBe(true);
    // Full snapshot kept for recovery.
    const folded = meta.folded_cards as Array<Record<string, unknown>>;
    expect(folded[0].location_id).toBe('loc-weeb');
  });

  it('flags a weaker match for review instead of folding', async () => {
    animeExpo.start_time = null;
    animeExpo.summary = 'Anime convention downtown.';
    animeExpo.updated_at = null;
    const weebCityCard: LocationRow = {
      id: 'loc-weeb',
      name: 'Weeb City',
      aliases: [],
      summary: null,
      metadata: { first_seen_at: '2026-02-01T00:00:00Z' },
      updated_at: '2026-02-01T00:00:00Z',
    };
    const deps = makeDeps([animeExpo], [weebCityCard]);
    const binder = new SlangPlaceAliasBinder(deps);

    const { reconciled, flaggedForReview } = await binder.reconcileExistingSlangPlaceCards(USER);

    expect(reconciled).toBe(0);
    expect(flaggedForReview).toBe(1);
    expect(deps.deleteLocation).not.toHaveBeenCalled();
    const suggested = (weebCityCard.metadata as Record<string, unknown>).suggested_alias_of as Record<string, unknown>;
    expect(suggested.target_id).toBe('ev-ax');
  });

  it('leaves real place cards untouched', async () => {
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);
    const { reconciled, flaggedForReview } = await binder.reconcileExistingSlangPlaceCards(USER);
    expect(reconciled).toBe(0);
    expect(flaggedForReview).toBe(0);
    expect(deps.deleteLocation).not.toHaveBeenCalled();
  });
});

describe('attachEntryMedia', () => {
  it('attaches tweet photos to every card the entry mentions (event by alias + venue by name)', async () => {
    animeExpo.metadata = { aliases: ['Weeb City'] };
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);

    const { attached } = await binder.attachEntryMedia(USER, [
      {
        id: 'entry-1',
        content: 'Photographed at the LA Convention Center — weeb city was packed.',
        date: '2026-07-04T20:00:00Z',
        sourceRef: { source: 'x_post', url: 'https://x.com/abel/status/123', entryId: 'entry-1' },
        media: [{ url: 'https://pbs.twimg.com/media/ax.jpg', type: 'photo', source: 'x_post' }],
      },
    ]);

    expect(attached).toBe(2);
    const eventMedia = (animeExpo.metadata as Record<string, unknown>).media as Array<Record<string, unknown>>;
    expect(eventMedia[0].url).toBe('https://pbs.twimg.com/media/ax.jpg');
    const placeMedia = (conventionCenter.metadata as Record<string, unknown>).media as Array<Record<string, unknown>>;
    expect(placeMedia[0].url).toBe('https://pbs.twimg.com/media/ax.jpg');
  });

  it('is idempotent per media URL', async () => {
    const deps = makeDeps([animeExpo], [conventionCenter]);
    const binder = new SlangPlaceAliasBinder(deps);
    const entry = {
      id: 'entry-1',
      content: 'at the LA Convention Center',
      media: [{ url: 'https://pbs.twimg.com/media/ax.jpg', type: 'photo' as const, source: 'x_post' as const }],
    };
    await binder.attachEntryMedia(USER, [entry]);
    const second = await binder.attachEntryMedia(USER, [entry]);
    expect(second.attached).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { buildEpisodeTitle } from '../../src/services/conversationCentered/episodePersistenceService';
import type { Episode } from '../../src/services/conversationCentered/episodeSegmentationCore';

describe('buildEpisodeTitle', () => {
  const names = new Map([
    ['e-abuela', 'Grandma Rose'],
    ['l-costco', 'Costco'],
    ['e-juan', 'Uncle James'],
  ]);

  it('prefers location and people when available', () => {
    const ep: Episode = {
      index: 1,
      messageIds: ['m1'],
      startAt: '2026-06-01T12:00:00Z',
      endAt: '2026-06-01T13:00:00Z',
      participants: ['e-abuela', 'e-juan'],
      locations: ['l-costco'],
      boundaryReason: 'entity-shift',
    };
    expect(buildEpisodeTitle(ep, names)).toBe('Costco · Grandma Rose & Uncle James');
  });

  it('falls back to formatted boundary reason', () => {
    const ep: Episode = {
      index: 1,
      messageIds: ['m1'],
      startAt: '2026-06-01T12:00:00Z',
      endAt: '2026-06-01T22:00:00Z',
      participants: [],
      locations: [],
      boundaryReason: 'time-gap(10h)',
    };
    expect(buildEpisodeTitle(ep, names)).toBe('10h gap');
  });

  it('thread start uses location or person when known', () => {
    const ep: Episode = {
      index: 0,
      messageIds: ['m1'],
      startAt: '2026-06-01T09:00:00Z',
      endAt: '2026-06-01T09:30:00Z',
      participants: ['e-abuela'],
      locations: ['l-costco'],
      boundaryReason: 'thread-start',
    };
    expect(buildEpisodeTitle(ep, names)).toBe('Costco');
  });
});

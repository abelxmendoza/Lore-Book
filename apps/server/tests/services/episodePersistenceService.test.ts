import { describe, expect, it } from 'vitest';

import { buildEpisodeTitle, resolvePrimaryEntity } from '../../src/services/conversationCentered/episodePersistenceService';
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

describe('resolvePrimaryEntity', () => {
  const baseEp: Episode = {
    index: 0,
    messageIds: ['m1'],
    startAt: '2026-06-01T09:00:00Z',
    endAt: '2026-06-01T09:30:00Z',
    participants: [],
    locations: [],
    boundaryReason: 'entity-shift',
  };

  const costco = '11111111-1111-1111-1111-111111111111';
  const unpromotedLocation = '22222222-2222-2222-2222-222222222222';
  const vicky = '33333333-3333-3333-3333-333333333333';
  const romi = '44444444-4444-4444-4444-444444444444';
  const unpromotedChar1 = '55555555-5555-5555-5555-555555555555';
  const unpromotedChar2 = '66666666-6666-6666-6666-666666666666';

  it('picks the location when it resolves to a real location row', () => {
    const ep: Episode = { ...baseEp, locations: [costco], participants: [vicky] };
    const result = resolvePrimaryEntity(ep, new Set([vicky]), new Set([costco]));
    expect(result).toEqual({ type: 'location', id: costco });
  });

  it('falls through participants in order until one resolves to a real character', () => {
    const ep: Episode = { ...baseEp, participants: [unpromotedChar1, vicky, romi] };
    const result = resolvePrimaryEntity(ep, new Set([vicky, romi]), new Set());
    expect(result).toEqual({ type: 'character', id: vicky });
  });

  it('skips a location that does not resolve to a real location row', () => {
    const ep: Episode = { ...baseEp, locations: [unpromotedLocation], participants: [vicky] };
    const result = resolvePrimaryEntity(ep, new Set([vicky]), new Set());
    expect(result).toEqual({ type: 'character', id: vicky });
  });

  it('returns null when nothing resolves (empty episode or all-unpromoted mentions)', () => {
    const ep: Episode = { ...baseEp, participants: [unpromotedChar1, unpromotedChar2] };
    const result = resolvePrimaryEntity(ep, new Set(), new Set());
    expect(result).toBeNull();
  });

  it('returns null for a genuinely empty episode', () => {
    const result = resolvePrimaryEntity(baseEp, new Set(), new Set());
    expect(result).toBeNull();
  });
});

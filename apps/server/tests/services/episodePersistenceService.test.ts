import { describe, expect, it, vi } from 'vitest';

type OrgMemberRow = { organization_id: string; character_id: string };
let orgMembers: OrgMemberRow[] = [];

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: (_col: string, ids: string[]) => {
              const filtered = orgMembers.filter((row) => ids.includes(row.character_id));
              return Promise.resolve({ data: table === 'organization_members' ? filtered : [], error: null });
            },
          }),
        }),
      }),
    }),
  },
}));

const USER = 'user-1';

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
  const disneyland = '22222222-2222-2222-2222-222222222222';
  const maya = '33333333-3333-3333-3333-333333333333';
  const priya = '44444444-4444-4444-4444-444444444444';
  const unpromotedChar1 = '55555555-5555-5555-5555-555555555555';
  const unpromotedChar2 = '66666666-6666-6666-6666-666666666666';
  const names = new Map([
    [costco, 'Costco'],
    [disneyland, 'Disneyland'],
    [maya, 'Maya'],
    [priya, 'Priya'],
  ]);

  it('picks a grounded location over a co-mentioned person', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, locations: [costco], participants: [maya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya]), new Set([costco]), {
      text: 'I went to Costco with Maya.',
      namesById: names,
    });
    expect(result).toEqual({ type: 'location', id: costco });
  });

  it('does not pick the first mentioned character when they are only referenced', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, participants: [priya, maya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya, priya]), new Set(), {
      text: 'I thought about Priya. Later I talked to Maya after the show.',
      namesById: names,
    });
    expect(result).toEqual({ type: 'character', id: maya });
  });

  it('does not treat a discussed place as the primary entity', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, locations: [disneyland], participants: [maya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya]), new Set([disneyland]), {
      text: 'I talked to Maya and told her about Disneyland.',
      namesById: names,
    });
    expect(result).toEqual({ type: 'character', id: maya });
  });

  it('returns null when nothing is grounded, even if mentions exist', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, participants: [priya], locations: [disneyland] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([priya]), new Set([disneyland]), {
      text: 'I kept thinking about Priya and told Jamie about Disneyland.',
      namesById: names,
    });
    expect(result).toBeNull();
  });

  it('returns null without text rather than guessing first mention', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, participants: [maya], locations: [costco] };
    expect(await resolvePrimaryEntity(USER, ep, new Set([maya]), new Set([costco]))).toBeNull();
  });

  it('returns null for a genuinely empty episode', async () => {
    orgMembers = [];
    const result = await resolvePrimaryEntity(USER, baseEp, new Set(), new Set());
    expect(result).toBeNull();
  });

  it('returns null when mentions never resolve to promoted entities', async () => {
    orgMembers = [];
    const ep: Episode = { ...baseEp, participants: [unpromotedChar1, unpromotedChar2] };
    const result = await resolvePrimaryEntity(USER, ep, new Set(), new Set(), {
      text: 'I went with Maya.',
      namesById: names,
    });
    expect(result).toBeNull();
  });

  it('picks an organization via roster overlap when two co-present characters share an active org, with no location/character grounded', async () => {
    const orgId = '77777777-7777-7777-7777-777777777777';
    orgMembers = [
      { organization_id: orgId, character_id: maya },
      { organization_id: orgId, character_id: priya },
    ];
    const ep: Episode = { ...baseEp, participants: [maya, priya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya, priya]), new Set(), {
      text: 'Just hanging out, nothing notable happened.',
      namesById: names,
    });
    expect(result).toEqual({ type: 'organization', id: orgId });
  });

  it('does not attribute an organization from a single member alone', async () => {
    const orgId = '77777777-7777-7777-7777-777777777777';
    orgMembers = [{ organization_id: orgId, character_id: maya }];
    const ep: Episode = { ...baseEp, participants: [maya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya]), new Set(), {
      text: 'Just hanging out, nothing notable happened.',
      namesById: names,
    });
    expect(result).toBeNull();
  });

  it('does not attribute an organization when co-present members are tied across two orgs', async () => {
    const orgA = '77777777-7777-7777-7777-777777777777';
    const orgB = '88888888-8888-8888-8888-888888888888';
    orgMembers = [
      { organization_id: orgA, character_id: maya },
      { organization_id: orgB, character_id: priya },
      { organization_id: orgA, character_id: unpromotedChar1 },
      { organization_id: orgB, character_id: unpromotedChar2 },
    ];
    const ep: Episode = { ...baseEp, participants: [maya, priya, unpromotedChar1, unpromotedChar2] };
    const result = await resolvePrimaryEntity(
      USER,
      ep,
      new Set([maya, priya, unpromotedChar1, unpromotedChar2]),
      new Set(),
      { text: 'Just hanging out, nothing notable happened.', namesById: names },
    );
    expect(result).toBeNull();
  });

  it('still prefers a grounded location/character over organization roster overlap', async () => {
    const orgId = '77777777-7777-7777-7777-777777777777';
    orgMembers = [
      { organization_id: orgId, character_id: maya },
      { organization_id: orgId, character_id: priya },
    ];
    const ep: Episode = { ...baseEp, locations: [costco], participants: [maya, priya] };
    const result = await resolvePrimaryEntity(USER, ep, new Set([maya, priya]), new Set([costco]), {
      text: 'I went to Costco with Maya and Priya.',
      namesById: names,
    });
    expect(result).toEqual({ type: 'location', id: costco });
  });
});

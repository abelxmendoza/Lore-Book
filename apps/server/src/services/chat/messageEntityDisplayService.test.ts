import { describe, expect, it, vi, beforeEach } from 'vitest';

import { resolveMessageEntitiesForDisplay } from './messageEntityDisplayService';

const fixture = {
  characters: [{ id: 'c1', name: 'Tía Maria', alias: ['Maria'] }],
  locations: [{ id: 'l1', name: 'San Diego' }],
  organizations: [{ id: 'o1', name: 'Acme Corp' }],
  omega_entities: [
    {
      id: 'oe1',
      name: 'Zephyr',
      type: 'PERSON',
      mention_status: 'mentioned_only',
      mention_count: 2,
    },
    {
      id: 'oe2',
      name: 'Tía Maria',
      type: 'CHARACTER',
      mention_status: 'confirmed',
      mention_count: 5,
    },
  ],
};

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: keyof typeof fixture) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: fixture[table] ?? [],
            error: null,
          }),
        }),
      }),
    })),
  },
}));

describe('resolveMessageEntitiesForDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns character, location, and organization chips for a multi-entity message', async () => {
    const chips = await resolveMessageEntitiesForDisplay(
      'user-1',
      'Tía Maria met me at Acme Corp in San Diego.'
    );

    expect(chips.map((c) => c.name).sort()).toEqual(['Acme Corp', 'San Diego', 'Tía Maria']);
    expect(chips.find((c) => c.name === 'Tía Maria')).toMatchObject({
      id: 'c1',
      type: 'character',
      provenance: 'character_book',
      confidence: 1,
    });
    expect(chips.find((c) => c.name === 'San Diego')).toMatchObject({
      id: 'l1',
      type: 'location',
      provenance: 'location_book',
    });
    expect(chips.find((c) => c.name === 'Acme Corp')).toMatchObject({
      id: 'o1',
      type: 'organization',
      provenance: 'organization_book',
    });
  });

  it('surfaces omega-only entities with mentioned_only status', async () => {
    const chips = await resolveMessageEntitiesForDisplay(
      'user-1',
      'I keep thinking about Zephyr lately.'
    );

    expect(chips).toEqual([
      expect.objectContaining({
        id: 'oe1',
        name: 'Zephyr',
        type: 'character',
        provenance: 'omega_entity',
        mentionStatus: 'mentioned_only',
      }),
    ]);
    expect(chips[0].confidence).toBeGreaterThan(0.5);
  });

  it('prefers book entities over duplicate omega rows and boosts confidence', async () => {
    const chips = await resolveMessageEntitiesForDisplay(
      'user-1',
      'Tell me what happened with Tía Maria.'
    );

    expect(chips.filter((c) => c.name === 'Tía Maria')).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      id: 'c1',
      provenance: 'character_book',
      mentionStatus: 'confirmed',
    });
    expect(chips[0].confidence).toBeGreaterThanOrEqual(1);
  });

  it('returns empty when nothing in the message matches known entities', async () => {
    const chips = await resolveMessageEntitiesForDisplay(
      'user-1',
      'Just a quiet day at home.'
    );
    expect(chips).toEqual([]);
  });
});

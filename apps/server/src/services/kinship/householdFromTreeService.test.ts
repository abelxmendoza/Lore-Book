import { describe, expect, it, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deriveHouseholdMembers } from './householdFromTreeService';

type Row = Record<string, unknown>;

/** Chainable stub matching the subset of the Supabase query builder this service uses. */
function chain(data: Row[] | null, error: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  return builder;
}

describe('deriveHouseholdMembers', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('returns empty for no anchors without querying', async () => {
    const result = await deriveHouseholdMembers('user-1', []);
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('derives a spouse', async () => {
    fromMock.mockImplementationOnce(() =>
      chain([{ source_character_id: 'grace', target_character_id: 'husband', relationship_type: 'spouse_of' }]),
    );
    fromMock.mockImplementationOnce(() => chain([]));
    fromMock.mockImplementationOnce(() => chain([{ id: 'husband', name: 'Robert', species: null }]));

    const result = await deriveHouseholdMembers('user-1', ['grace']);
    expect(result).toEqual([
      { characterId: 'husband', name: 'Robert', role: 'spouse', species: null, viaAnchorId: 'grace' },
    ]);
  });

  it('derives kids of the anchor plus step-kids sourced through the spouse', async () => {
    fromMock.mockImplementationOnce(() =>
      chain([
        { source_character_id: 'grace', target_character_id: 'husband', relationship_type: 'spouse_of' },
        { source_character_id: 'grace', target_character_id: 'kid1', relationship_type: 'parent_of' },
      ]),
    );
    fromMock.mockImplementationOnce(() =>
      chain([{ source_character_id: 'husband', target_character_id: 'stepkid', relationship_type: 'parent_of' }]),
    );
    fromMock.mockImplementationOnce(() =>
      chain([
        { id: 'husband', name: 'Robert', species: null },
        { id: 'kid1', name: 'Kid One', species: null },
        { id: 'stepkid', name: 'Step Kid', species: null },
      ]),
    );

    const result = await deriveHouseholdMembers('user-1', ['grace']);
    const byId = Object.fromEntries(result.map((m) => [m.characterId, m]));
    expect(byId.husband.role).toBe('spouse');
    expect(byId.kid1.role).toBe('child');
    expect(byId.stepkid.role).toBe('child');
  });

  it('derives pets owned by the anchor', async () => {
    fromMock.mockImplementationOnce(() =>
      chain([{ source_character_id: 'grace', target_character_id: 'rex', relationship_type: 'owner_of' }]),
    );
    fromMock.mockImplementationOnce(() => chain([{ id: 'rex', name: 'Rex', species: 'dog' }]));

    const result = await deriveHouseholdMembers('user-1', ['grace']);
    expect(result).toEqual([{ characterId: 'rex', name: 'Rex', role: 'pet', species: 'dog', viaAnchorId: 'grace' }]);
  });

  it('skips characters the user already removed from the family tree', async () => {
    fromMock.mockImplementationOnce(() =>
      chain([{ source_character_id: 'jamie', target_character_id: 'alex', relationship_type: 'spouse_of' }]),
    );
    fromMock.mockImplementationOnce(() => chain([]));
    fromMock.mockImplementationOnce(() =>
      chain([
        {
          id: 'alex',
          name: 'Alex Friend',
          species: null,
          metadata: { family_excluded: { value: true, reason: 'tree_remove' } },
        },
      ]),
    );

    const result = await deriveHouseholdMembers('user-1', ['jamie']);
    expect(result).toEqual([]);
  });

  it('does not fabricate a member when the tree has no relations for the anchor', async () => {
    fromMock.mockImplementationOnce(() => chain([]));
    const result = await deriveHouseholdMembers('user-1', ['lonely']);
    expect(result).toEqual([]);
  });

  it('never re-adds an anchor as its own household member', async () => {
    fromMock.mockImplementationOnce(() =>
      chain([{ source_character_id: 'grace', target_character_id: 'james', relationship_type: 'spouse_of' }]),
    );
    fromMock.mockImplementationOnce(() => chain([]));
    fromMock.mockImplementationOnce(() => chain([{ id: 'james', name: 'James', species: null }]));

    const result = await deriveHouseholdMembers('user-1', ['grace', 'james']);
    expect(result.find((m) => m.characterId === 'james')).toBeUndefined();
  });

  it('resolves non-fatally to an empty list when the query errors', async () => {
    fromMock.mockImplementationOnce(() => chain(null, new Error('db down')));
    const result = await deriveHouseholdMembers('user-1', ['grace']);
    expect(result).toEqual([]);
  });
});

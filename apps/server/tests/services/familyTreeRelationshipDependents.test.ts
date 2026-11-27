import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertBidirectionalFamilyEdge, retireFamilyEdgesOfTypesBetween, syncSiblingsUnderParent } = vi.hoisted(() => ({
  upsertBidirectionalFamilyEdge: vi.fn(async () => true),
  retireFamilyEdgesOfTypesBetween: vi.fn(async () => 1),
  syncSiblingsUnderParent: vi.fn(async () => 0),
}));

const fromMock = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('../../src/services/kinship/familyEdgeWriter', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/kinship/familyEdgeWriter')>(
    '../../src/services/kinship/familyEdgeWriter',
  );
  return {
    ...actual,
    upsertBidirectionalFamilyEdge,
    retireFamilyEdgesOfTypesBetween,
    syncSiblingsUnderParent,
  };
});

vi.mock('../../src/services/identity/identityLedgerService', () => ({
  identityLedgerService: { recordMutation: vi.fn(async () => undefined) },
}));

import { familyTreeService } from '../../src/services/familyTreeService';

function chain(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'insert']) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe('familyTreeService — romantic relationship kids/pets write path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    vi.spyOn(familyTreeService, 'findUserCharacterId').mockResolvedValue('you');
    vi.spyOn(familyTreeService, 'getKidsTogetherForRelationship').mockResolvedValue([
      { id: 'riley', name: 'Riley', relation: 'together', belongsTo: 'both', coParents: [] },
    ]);
    vi.spyOn(familyTreeService, 'getPetsTogetherForRelationship').mockResolvedValue([]);
  });

  it('links an existing child to both self and partner with parent_of edges', async () => {
    fromMock.mockImplementation(() => chain({ data: { id: 'riley' }, error: null }));

    const result = await familyTreeService.linkDependentToRomanticRelationship('user-1', 'partner-1', 'dating', {
      kind: 'child',
      belongsTo: 'both',
      characterId: 'riley',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kids.map((k) => k.id)).toEqual(['riley']);
    expect(upsertBidirectionalFamilyEdge).toHaveBeenCalledWith(
      'user-1',
      'you',
      'riley',
      'parent_of',
      expect.objectContaining({ source: 'relationship_kids_pets_tab' }),
    );
    expect(upsertBidirectionalFamilyEdge).toHaveBeenCalledWith(
      'user-1',
      'partner-1',
      'riley',
      'parent_of',
      expect.objectContaining({ source: 'relationship_kids_pets_tab' }),
    );
    expect(syncSiblingsUnderParent).toHaveBeenCalled();
  });

  it('links a pet to only the partner with owner_of', async () => {
    fromMock.mockImplementation(() => chain({ data: { id: 'waffles' }, error: null }));

    const result = await familyTreeService.linkDependentToRomanticRelationship('user-1', 'partner-1', 'married', {
      kind: 'pet',
      belongsTo: 'partner',
      characterId: 'waffles',
    });

    expect(result.ok).toBe(true);
    expect(upsertBidirectionalFamilyEdge).toHaveBeenCalledTimes(1);
    expect(upsertBidirectionalFamilyEdge).toHaveBeenCalledWith(
      'user-1',
      'partner-1',
      'waffles',
      'owner_of',
      expect.objectContaining({ source: 'relationship_kids_pets_tab' }),
    );
  });

  it('refuses to link the partner as a dependent', async () => {
    const result = await familyTreeService.linkDependentToRomanticRelationship('user-1', 'partner-1', 'dating', {
      kind: 'child',
      characterId: 'partner-1',
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(upsertBidirectionalFamilyEdge).not.toHaveBeenCalled();
  });

  it('unlinks a child by retiring parent edges to self and partner without deleting the card', async () => {
    const result = await familyTreeService.unlinkDependentFromRomanticRelationship(
      'user-1',
      'partner-1',
      'dating',
      'riley',
      'child',
    );

    expect(result.ok).toBe(true);
    expect(retireFamilyEdgesOfTypesBetween).toHaveBeenCalledWith('user-1', 'you', 'riley', ['parent_of']);
    expect(retireFamilyEdgesOfTypesBetween).toHaveBeenCalledWith('user-1', 'partner-1', 'riley', ['parent_of']);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

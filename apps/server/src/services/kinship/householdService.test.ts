import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isFamilyExcluded, isSyntheticNodeId } from '../familyTreeService';
import { isHouseholdOrg, isListedFamilyMember } from './householdService';

describe('isHouseholdOrg', () => {
  it('accepts family orgs marked as residences and hides deleted ones', () => {
    expect(isHouseholdOrg("Jamie's House", { inference_source: 'household_residence' })).toBe(true);
    expect(isHouseholdOrg('Maple Home', {})).toBe(true);
    expect(isHouseholdOrg('Holiday Planning Crew', { inference_source: 'kinship_graph' })).toBe(false);
    expect(
      isHouseholdOrg("Jamie's House", {
        inference_source: 'household_residence',
        household_deleted: { reason: 'moved' },
      }),
    ).toBe(false);
  });
});

describe('isListedFamilyMember', () => {
  it('hides synthetic nodes, tree-excludes, and people not on the current tree', () => {
    expect(isListedFamilyMember('head-jamie', null)).toBe(false);
    expect(isSyntheticNodeId('__self')).toBe(true);
    expect(isListedFamilyMember('__self', new Set(['__self']))).toBe(false);
    expect(isFamilyExcluded({ family_excluded: { value: true } })).toBe(true);
    expect(
      isListedFamilyMember('char-x', new Set(['char-1']), { family_excluded: { value: true } }),
    ).toBe(false);
    expect(isListedFamilyMember('char-x', new Set(['char-1', 'char-2']))).toBe(false);
    expect(isListedFamilyMember('char-1', new Set(['char-1', 'char-2']))).toBe(true);
    expect(isListedFamilyMember('char-1', null, { family_excluded: { value: true } })).toBe(false);
    expect(isListedFamilyMember('char-1', null)).toBe(true);
  });
});

const fromMock = vi.fn();
const getMembersForOrganizationsMock = vi.fn();
const getUserFamilyTreeMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock('../organizationService', () => ({
  organizationService: {
    getMembersForOrganizations: (...args: unknown[]) => getMembersForOrganizationsMock(...args),
  },
}));
vi.mock('../familyTreeService', async (orig) => {
  const actual = await orig<typeof import('../familyTreeService')>();
  return {
    ...actual,
    familyTreeService: {
      getUserFamilyTree: (...args: unknown[]) => getUserFamilyTreeMock(...args),
    },
  };
});

function chain(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown }) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return builder;
}

describe('householdService.listHouseholds', () => {
  beforeEach(() => {
    fromMock.mockReset();
    getMembersForOrganizationsMock.mockReset();
    getUserFamilyTreeMock.mockReset();
  });

  it('omits tree-excluded people even when they still have a roster row', async () => {
    fromMock
      .mockImplementationOnce(() =>
        chain([
          {
            id: 'org-1',
            name: "Jamie's House",
            description: null,
            metadata: { inference_source: 'household_residence', head_of_household: 'Jamie' },
          },
        ]),
      )
      .mockImplementationOnce(() =>
        chain([
          { id: 'char-1', metadata: {} },
          { id: 'char-x', metadata: { family_excluded: { value: true, reason: 'tree_remove' } } },
        ]),
      );
    getMembersForOrganizationsMock.mockResolvedValueOnce(
      new Map([
        [
          'org-1',
          [
            { character_id: 'char-1', character_name: 'Jamie', role: 'resident', status: 'active' },
            { character_id: 'char-x', character_name: 'Alex Friend', role: 'resident', status: 'active' },
          ],
        ],
      ]),
    );

    const { householdService } = await import('./householdService');
    const households = await householdService.listHouseholds('user-1', {
      familyMemberIds: ['char-1'],
    });

    expect(households).toHaveLength(1);
    expect(households[0].residents.map((m) => m.name)).toEqual(['Jamie']);
    expect(households[0].residents.find((m) => m.characterId === 'char-x')).toBeUndefined();
    expect(getUserFamilyTreeMock).not.toHaveBeenCalled();
  });
});

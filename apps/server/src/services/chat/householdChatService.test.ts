import { describe, expect, it, vi, beforeEach } from 'vitest';

const listHouseholdsMock = vi.fn();
const createHouseholdMock = vi.fn();
const addHouseholdMemberMock = vi.fn();
const removeHouseholdMemberMock = vi.fn();
const moveHouseholdMock = vi.fn();
const findOrCreateCharacterMock = vi.fn();

vi.mock('../kinship/householdService', () => ({
  householdService: { listHouseholds: (...args: unknown[]) => listHouseholdsMock(...args) },
}));
vi.mock('../kinship/householdWriteService', () => ({
  householdWriteService: {
    createHousehold: (...args: unknown[]) => createHouseholdMock(...args),
    addHouseholdMember: (...args: unknown[]) => addHouseholdMemberMock(...args),
    removeHouseholdMember: (...args: unknown[]) => removeHouseholdMemberMock(...args),
    moveHousehold: (...args: unknown[]) => moveHouseholdMock(...args),
  },
}));
vi.mock('./familyWriteService', () => ({
  findOrCreateCharacter: (...args: unknown[]) => findOrCreateCharacterMock(...args),
}));

function household(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    name: "Mom and Dad's House",
    locationName: '123 Maple St',
    residents: [],
    visitors: [],
    residentCount: 0,
    confidence: 0.9,
    ...overrides,
  };
}

describe('writeHouseholdFromChat', () => {
  beforeEach(() => {
    listHouseholdsMock.mockReset();
    createHouseholdMock.mockReset();
    addHouseholdMemberMock.mockReset();
    removeHouseholdMemberMock.mockReset();
    moveHouseholdMock.mockReset();
    findOrCreateCharacterMock.mockReset();
  });

  it('creates a household', async () => {
    createHouseholdMock.mockResolvedValueOnce({ id: 'org-1', name: "Grandma's House" });

    const { writeHouseholdFromChat } = await import('./householdChatService');
    const result = await writeHouseholdFromChat('user-1', "create a household called Grandma's House");

    expect(result.operation).toBe('create');
    expect(createHouseholdMock).toHaveBeenCalledWith('user-1', "Grandma's House");
  });

  it('adds a member to an existing household, with an optional reason', async () => {
    listHouseholdsMock.mockResolvedValueOnce([household()]);
    findOrCreateCharacterMock.mockResolvedValueOnce({ id: 'char-1', name: 'Ralph', created: false });

    const { writeHouseholdFromChat } = await import('./householdChatService');
    const result = await writeHouseholdFromChat(
      'user-1',
      "add Ralph to the Mom and Dad's House household because he moved back in",
    );

    expect(result.operation).toBe('add_member');
    expect(addHouseholdMemberMock).toHaveBeenCalledWith('user-1', 'org-1', 'Ralph', {
      characterId: 'char-1',
      reason: 'he moved back in',
    });
  });

  it('removes a member ("X moved out of the Y household because ...")', async () => {
    listHouseholdsMock.mockResolvedValueOnce([household()]);
    findOrCreateCharacterMock.mockResolvedValueOnce({ id: 'char-1', name: 'Ralph', created: false });
    removeHouseholdMemberMock.mockResolvedValueOnce(true);

    const { writeHouseholdFromChat } = await import('./householdChatService');
    const result = await writeHouseholdFromChat(
      'user-1',
      "Ralph moved out of the Mom and Dad's House household because he got his own apartment",
    );

    expect(result.operation).toBe('remove_member');
    expect(removeHouseholdMemberMock).toHaveBeenCalledWith('user-1', 'org-1', 'char-1', 'he got his own apartment');
  });

  it('moves a household to a new location, keeping the same household identity', async () => {
    listHouseholdsMock.mockResolvedValueOnce([household()]);
    moveHouseholdMock.mockResolvedValueOnce(true);

    const { writeHouseholdFromChat } = await import('./householdChatService');
    const result = await writeHouseholdFromChat(
      'user-1',
      "move the Mom and Dad's House household to 456 Oak Ave",
    );

    expect(result.operation).toBe('move');
    expect(result.householdId).toBe('org-1');
    expect(moveHouseholdMock).toHaveBeenCalledWith('user-1', 'org-1', '456 Oak Ave', undefined);
  });

  it('returns a confirmation question for a household delete request, without deleting anything', async () => {
    listHouseholdsMock.mockResolvedValueOnce([household()]);

    const { writeHouseholdFromChat } = await import('./householdChatService');
    const result = await writeHouseholdFromChat('user-1', "delete the Mom and Dad's House household");

    expect(result.operation).toBe('delete_pending');
    expect(result.summary).toMatch(/Delete the \*\*Mom and Dad's House\*\*/);
  });

  it('does not guess when a household name matches more than one household', async () => {
    listHouseholdsMock.mockResolvedValueOnce([
      household({ id: 'org-1', name: 'House A' }),
      household({ id: 'org-2', name: 'House A Annex' }),
    ]);

    const { writeHouseholdFromChat } = await import('./householdChatService');
    await expect(writeHouseholdFromChat('user-1', 'delete the House A household')).rejects.toThrow(/more than one household/i);
  });

  it('reports clearly when no household matches', async () => {
    listHouseholdsMock.mockResolvedValueOnce([]);

    const { writeHouseholdFromChat } = await import('./householdChatService');
    await expect(writeHouseholdFromChat('user-1', 'delete the Nonexistent Place household')).rejects.toThrow(/couldn't find/i);
  });
});

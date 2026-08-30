import { describe, expect, it, vi, beforeEach } from 'vitest';

const findFamilyMemberByNameMock = vi.fn();
const deleteMemberMock = vi.fn();
const findHouseholdByNameMock = vi.fn();
const deleteHouseholdMock = vi.fn();

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../familyTreeService', () => ({
  familyTreeService: { deleteMember: (...args: unknown[]) => deleteMemberMock(...args) },
}));
vi.mock('../chat/familyWriteService', () => ({
  findFamilyMemberByName: (...args: unknown[]) => findFamilyMemberByNameMock(...args),
}));
vi.mock('../chat/householdChatService', () => ({
  findHouseholdByName: (...args: unknown[]) => findHouseholdByNameMock(...args),
}));
vi.mock('../kinship/householdWriteService', () => ({
  householdWriteService: { deleteHousehold: (...args: unknown[]) => deleteHouseholdMock(...args) },
}));

describe('applyResponseAction — delete_family_member', () => {
  beforeEach(() => {
    findFamilyMemberByNameMock.mockReset();
    deleteMemberMock.mockReset();
  });

  it('deletes the re-resolved family member on confirmation', async () => {
    findFamilyMemberByNameMock.mockResolvedValueOnce({
      status: 'found',
      id: 'char-1',
      name: 'Ralph Mendoza',
      relation: 'uncle',
    });
    deleteMemberMock.mockResolvedValueOnce(true);

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_family_member',
      label: 'Delete Ralph Mendoza',
      payload: { characterName: 'Ralph Mendoza' },
    });

    expect(result).toMatchObject({
      applied: true,
      status: 'deleted',
      entity: { kind: 'character', id: 'char-1', name: 'Ralph Mendoza' },
    });
    expect(deleteMemberMock).toHaveBeenCalledWith('user-1', 'char-1', expect.any(String));
  });

  it('does not delete anything when the name no longer resolves', async () => {
    findFamilyMemberByNameMock.mockResolvedValueOnce({ status: 'not_found' });

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_family_member',
      label: 'Delete Ralph Mendoza',
      payload: { characterName: 'Ralph Mendoza' },
    });

    expect(result.applied).toBe(false);
    expect(result.status).toBe('not_found');
    expect(deleteMemberMock).not.toHaveBeenCalled();
  });

  it('does not guess when the name is ambiguous at confirm time', async () => {
    findFamilyMemberByNameMock.mockResolvedValueOnce({
      status: 'ambiguous',
      candidates: ['Ralph Mendoza', 'Ralph Ochoa'],
    });

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_family_member',
      label: 'Delete Ralph',
      payload: { characterName: 'Ralph' },
    });

    expect(result.applied).toBe(false);
    expect(result.status).toBe('not_found');
    expect(deleteMemberMock).not.toHaveBeenCalled();
  });

  it('is invalid without a character name', async () => {
    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', { type: 'delete_family_member', label: 'Delete' });

    expect(result.status).toBe('invalid');
    expect(findFamilyMemberByNameMock).not.toHaveBeenCalled();
  });
});

describe('applyResponseAction — delete_household', () => {
  beforeEach(() => {
    findHouseholdByNameMock.mockReset();
    deleteHouseholdMock.mockReset();
  });

  it('deletes the re-resolved household on confirmation', async () => {
    findHouseholdByNameMock.mockResolvedValueOnce({ status: 'found', id: 'org-1', name: "Mom and Dad's House" });
    deleteHouseholdMock.mockResolvedValueOnce(true);

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_household',
      label: "Delete Mom and Dad's House household",
      payload: { householdName: "Mom and Dad's House" },
    });

    expect(result).toMatchObject({
      applied: true,
      status: 'deleted',
      entity: { kind: 'organization', id: 'org-1', name: "Mom and Dad's House" },
    });
    expect(deleteHouseholdMock).toHaveBeenCalledWith('user-1', 'org-1', expect.any(String));
  });

  it('does not delete anything when the household no longer resolves', async () => {
    findHouseholdByNameMock.mockResolvedValueOnce({ status: 'not_found' });

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_household',
      label: 'Delete House household',
      payload: { householdName: 'House' },
    });

    expect(result.applied).toBe(false);
    expect(result.status).toBe('not_found');
    expect(deleteHouseholdMock).not.toHaveBeenCalled();
  });

  it('does not guess when the household name is ambiguous at confirm time', async () => {
    findHouseholdByNameMock.mockResolvedValueOnce({
      status: 'ambiguous',
      candidates: ['House A', 'House A Annex'],
    });

    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', {
      type: 'delete_household',
      label: 'Delete House A household',
      payload: { householdName: 'House A' },
    });

    expect(result.applied).toBe(false);
    expect(result.status).toBe('not_found');
    expect(deleteHouseholdMock).not.toHaveBeenCalled();
  });

  it('is invalid without a household name', async () => {
    const { applyResponseAction } = await import('./responseActionService');
    const result = await applyResponseAction('user-1', { type: 'delete_household', label: 'Delete' });

    expect(result.status).toBe('invalid');
    expect(findHouseholdByNameMock).not.toHaveBeenCalled();
  });
});

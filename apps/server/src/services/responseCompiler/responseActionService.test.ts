import { describe, expect, it, vi, beforeEach } from 'vitest';

const findFamilyMemberByNameMock = vi.fn();
const deleteMemberMock = vi.fn();

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../familyTreeService', () => ({
  familyTreeService: { deleteMember: (...args: unknown[]) => deleteMemberMock(...args) },
}));
vi.mock('../chat/familyWriteService', () => ({
  findFamilyMemberByName: (...args: unknown[]) => findFamilyMemberByNameMock(...args),
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

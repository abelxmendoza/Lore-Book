import { describe, it, expect, vi } from 'vitest';
import { applyResponseAction } from '../../../src/services/responseCompiler/responseActionService';

function fakeOrgService(existing: { id: string; name: string } | null) {
  return {
    findByName: vi.fn().mockResolvedValue(existing),
    createOrganization: vi.fn().mockImplementation(async (_userId: string, data: { name: string }) => ({
      id: 'org-new',
      name: data.name,
    })),
  };
}

describe('applyResponseAction', () => {
  it('creates a group from a create_group chip (payload name)', async () => {
    const orgService = fakeOrgService(null);
    const result = await applyResponseAction(
      'u1',
      { type: 'create_group', label: 'Create School Band', payload: { groupName: 'School Band' } },
      { orgService },
    );
    expect(result.applied).toBe(true);
    expect(result.status).toBe('created');
    expect(result.entity).toEqual({ kind: 'organization', id: 'org-new', name: 'School Band' });
    expect(orgService.createOrganization).toHaveBeenCalledWith('u1', { name: 'School Band' });
  });

  it('derives the group name from the label when payload is absent', async () => {
    const orgService = fakeOrgService(null);
    await applyResponseAction('u1', { type: 'create_group', label: 'Create a School Band group' }, { orgService });
    expect(orgService.createOrganization).toHaveBeenCalledWith('u1', { name: 'School Band group' });
  });

  it('does not recreate an existing group (dedup)', async () => {
    const orgService = fakeOrgService({ id: 'org-7', name: 'School Band' });
    const result = await applyResponseAction(
      'u1',
      { type: 'create_group', label: 'Create School Band', payload: { groupName: 'School Band' } },
      { orgService },
    );
    expect(result.applied).toBe(false);
    expect(result.status).toBe('already_exists');
    expect(result.entity?.id).toBe('org-7');
    expect(orgService.createOrganization).not.toHaveBeenCalled();
  });

  it('defers character/relationship actions to the resolve-before-write pipeline', async () => {
    const orgService = fakeOrgService(null);
    for (const type of ['add_relationship', 'add_character', 'confirm_fact']) {
      const result = await applyResponseAction('u1', { type, label: `Add Bryan as best friend` }, { orgService });
      expect(result.applied).toBe(false);
      expect(result.status).toBe('not_yet_supported');
    }
    expect(orgService.createOrganization).not.toHaveBeenCalled();
  });

  it('rejects an unknown action type', async () => {
    const result = await applyResponseAction('u1', { type: 'launch_rockets', label: 'Launch' }, {
      orgService: fakeOrgService(null),
    });
    expect(result.status).toBe('invalid');
    expect(result.applied).toBe(false);
  });
});

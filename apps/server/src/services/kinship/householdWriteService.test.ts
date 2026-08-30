import { describe, expect, it, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
const addMemberMock = vi.fn();
const createOrganizationMock = vi.fn();
const getOrganizationMock = vi.fn();
const updateOrganizationMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../organizationService', () => ({
  organizationService: {
    addMember: (...args: unknown[]) => addMemberMock(...args),
    createOrganization: (...args: unknown[]) => createOrganizationMock(...args),
    getOrganization: (...args: unknown[]) => getOrganizationMock(...args),
    updateOrganization: (...args: unknown[]) => updateOrganizationMock(...args),
  },
}));

type Row = Record<string, unknown>;

/** Chainable stub for the subset of the Supabase builder this service uses. */
function chain(data: Row[] | Row | null, error: unknown = null, spies: Record<string, (...a: unknown[]) => unknown> = {}) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'insert', 'update', 'maybeSingle']) {
    builder[m] = (...args: unknown[]) => {
      spies[m]?.(...args);
      return builder;
    };
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown }) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return builder;
}

describe('householdWriteService', () => {
  beforeEach(() => {
    fromMock.mockReset();
    addMemberMock.mockReset();
    createOrganizationMock.mockReset();
    getOrganizationMock.mockReset();
    updateOrganizationMock.mockReset();
  });

  it('createHousehold creates the org and records the opening location', async () => {
    createOrganizationMock.mockResolvedValueOnce({ id: 'org-1', name: "Mom and Dad's House" });
    const insertSpy = vi.fn();
    fromMock.mockImplementationOnce(() => chain(null, null, { insert: insertSpy }));

    const { householdWriteService } = await import('./householdWriteService');
    const result = await householdWriteService.createHousehold('user-1', "Mom and Dad's House", {
      locationName: '123 Maple St',
      reason: 'where I grew up',
    });

    expect(result).toEqual({ id: 'org-1', name: "Mom and Dad's House" });
    expect(createOrganizationMock).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: "Mom and Dad's House",
      type: 'family',
      location: '123 Maple St',
    }));
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org-1', location_name: '123 Maple St', reason: 'where I grew up' }),
    );
  });

  it('addHouseholdMember adds to the roster and opens a new stay', async () => {
    addMemberMock.mockResolvedValueOnce({ character_id: 'char-1', character_name: 'Ralph' });
    const insertSpy = vi.fn();
    fromMock.mockImplementationOnce(() => chain(null, null, { insert: insertSpy }));

    const { householdWriteService } = await import('./householdWriteService');
    const result = await householdWriteService.addHouseholdMember('user-1', 'org-1', 'Ralph', {
      reason: 'moved in after college',
    });

    expect(result).toEqual({ characterId: 'char-1', characterName: 'Ralph' });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: 'org-1', character_id: 'char-1', join_reason: 'moved in after college' }),
    );
  });

  it('removeHouseholdMember flips the roster row to former and closes the open stay, without deleting either', async () => {
    const memberUpdateSpy = vi.fn();
    const stayUpdateSpy = vi.fn();
    fromMock
      .mockImplementationOnce(() => chain({ id: 'member-row-1' })) // select active member row
      .mockImplementationOnce(() => chain(null, null, { update: memberUpdateSpy })) // update organization_members
      .mockImplementationOnce(() => chain(null, null, { update: stayUpdateSpy })); // update household_stays

    const { householdWriteService } = await import('./householdWriteService');
    const ok = await householdWriteService.removeHouseholdMember('user-1', 'org-1', 'char-1', 'moved out on their own');

    expect(ok).toBe(true);
    expect(memberUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'former', notes: 'moved out on their own' }),
    );
    expect(stayUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ leave_reason: 'moved out on their own' }),
    );
  });

  it('removeHouseholdMember is a no-op when no active membership exists', async () => {
    fromMock.mockImplementationOnce(() => chain(null)); // no active member row found

    const { householdWriteService } = await import('./householdWriteService');
    const ok = await householdWriteService.removeHouseholdMember('user-1', 'org-1', 'char-1', 'reason');

    expect(ok).toBe(false);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('deleteHousehold soft-deletes via metadata and never removes the organizations row', async () => {
    getOrganizationMock.mockResolvedValueOnce({ id: 'org-1', metadata: { inference_source: 'household_residence' } });

    const { householdWriteService } = await import('./householdWriteService');
    const ok = await householdWriteService.deleteHousehold('user-1', 'org-1', 'we all moved out');

    expect(ok).toBe(true);
    expect(updateOrganizationMock).toHaveBeenCalledWith('user-1', 'org-1', {
      metadata: expect.objectContaining({
        inference_source: 'household_residence',
        household_deleted: expect.objectContaining({ reason: 'we all moved out' }),
      }),
    });
  });

  it('deleteHousehold reports false for a household that does not exist', async () => {
    getOrganizationMock.mockResolvedValueOnce(null);

    const { householdWriteService } = await import('./householdWriteService');
    const ok = await householdWriteService.deleteHousehold('user-1', 'missing-org', 'reason');

    expect(ok).toBe(false);
    expect(updateOrganizationMock).not.toHaveBeenCalled();
  });

  it('moveHousehold closes the current location period and opens a new one at the same household', async () => {
    getOrganizationMock.mockResolvedValueOnce({ id: 'org-1', metadata: { residence_name: '123 Maple St' } });
    const closeSpy = vi.fn();
    const insertSpy = vi.fn();
    fromMock
      .mockImplementationOnce(() => chain(null, null, { update: closeSpy })) // close prior location
      .mockImplementationOnce(() => chain(null, null, { insert: insertSpy })); // insert new location

    const { householdWriteService } = await import('./householdWriteService');
    const ok = await householdWriteService.moveHousehold('user-1', 'org-1', '456 Oak Ave', 'bigger place');

    expect(ok).toBe(true);
    expect(closeSpy).toHaveBeenCalledWith(expect.objectContaining({ moved_out_at: expect.any(String) }));
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ location_name: '456 Oak Ave', reason: 'bigger place' }),
    );
    expect(updateOrganizationMock).toHaveBeenCalledWith('user-1', 'org-1', {
      location: '456 Oak Ave',
      metadata: expect.objectContaining({ residence_name: '456 Oak Ave' }),
    });
  });

  it('getHouseholdHistory merges stays and locations sorted by most recent first', async () => {
    fromMock
      .mockImplementationOnce(() =>
        chain([
          {
            character_id: 'char-1',
            character_name: 'Ralph',
            joined_at: '2020-01-01T00:00:00Z',
            left_at: '2022-01-01T00:00:00Z',
            join_reason: 'moved in',
            leave_reason: 'moved out',
          },
        ]),
      )
      .mockImplementationOnce(() =>
        chain([
          {
            location_name: '123 Maple St',
            moved_in_at: '2019-01-01T00:00:00Z',
            moved_out_at: null,
            reason: null,
          },
        ]),
      );

    const { householdWriteService } = await import('./householdWriteService');
    const history = await householdWriteService.getHouseholdHistory('user-1', 'org-1');

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ kind: 'stay', characterName: 'Ralph', joinReason: 'moved in' });
    expect(history[1]).toMatchObject({ kind: 'location', locationName: '123 Maple St' });
  });
});

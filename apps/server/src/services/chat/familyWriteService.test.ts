import { describe, expect, it, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
const getUserFamilyTreeMock = vi.fn();
const setMemberRelationshipMock = vi.fn();
const excludeMemberMock = vi.fn();
const classifyForCreationMock = vi.fn();
const runExclusiveMock = vi.fn((_userId: string, fn: () => Promise<unknown>) => fn());

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock('../familyTreeService', () => ({
  familyTreeService: {
    getUserFamilyTree: (...args: unknown[]) => getUserFamilyTreeMock(...args),
    setMemberRelationship: (...args: unknown[]) => setMemberRelationshipMock(...args),
    excludeMember: (...args: unknown[]) => excludeMemberMock(...args),
  },
}));
vi.mock('../characterRegistry', () => ({
  characterRegistry: {
    runExclusive: (...args: unknown[]) => runExclusiveMock(...(args as [string, () => Promise<unknown>])),
    classifyForCreation: (...args: unknown[]) => classifyForCreationMock(...args),
  },
}));

type Row = Record<string, unknown>;

/** Chainable stub for the small subset of the Supabase builder used here. */
function chain(data: Row[] | Row | null, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'single']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown }) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return builder;
}

function member(overrides: Partial<Row> = {}): Row {
  return {
    id: 'char-1',
    name: 'Ralph Mendoza',
    first_name: 'Ralph',
    kinship_title: 'Uncle',
    relation: 'uncle',
    is_self: false,
    is_placeholder: false,
    ...overrides,
  };
}

describe('writeFamilyFromChat', () => {
  beforeEach(() => {
    fromMock.mockReset();
    getUserFamilyTreeMock.mockReset();
    setMemberRelationshipMock.mockReset();
    excludeMemberMock.mockReset();
    classifyForCreationMock.mockReset();
  });

  it('marks an existing character as a relation (pre-existing behavior)', async () => {
    fromMock.mockImplementationOnce(() => chain([member({ name: 'Marcus' })]));
    setMemberRelationshipMock.mockResolvedValueOnce(true);

    const { writeFamilyFromChat } = await import('./familyWriteService');
    const result = await writeFamilyFromChat('user-1', 'mark Marcus as my cousin');

    expect(result.operation).toBe('set_relation');
    expect(setMemberRelationshipMock).toHaveBeenCalledWith('user-1', 'char-1', { relation: 'cousin' });
  });

  it('sets a member\'s side without changing their relation', async () => {
    getUserFamilyTreeMock.mockResolvedValueOnce({ members: [member()] });
    setMemberRelationshipMock.mockResolvedValueOnce(true);

    const { writeFamilyFromChat } = await import('./familyWriteService');
    const result = await writeFamilyFromChat('user-1', "change Ralph's side to paternal");

    expect(result.operation).toBe('set_side');
    expect(setMemberRelationshipMock).toHaveBeenCalledWith('user-1', 'char-1', {
      relation: 'uncle',
      side: 'paternal',
    });
  });

  it('excludes a member from the tree without deleting the character', async () => {
    getUserFamilyTreeMock.mockResolvedValueOnce({ members: [member()] });
    excludeMemberMock.mockResolvedValueOnce(true);

    const { writeFamilyFromChat } = await import('./familyWriteService');
    const result = await writeFamilyFromChat('user-1', 'remove Ralph from my family tree');

    expect(result.operation).toBe('exclude');
    expect(excludeMemberMock).toHaveBeenCalledWith('user-1', 'char-1');
  });

  it('returns a confirmation question for a delete request, without deleting anything', async () => {
    getUserFamilyTreeMock.mockResolvedValueOnce({ members: [member()] });

    const { writeFamilyFromChat } = await import('./familyWriteService');
    const result = await writeFamilyFromChat('user-1', 'delete Uncle Ralph');

    expect(result.operation).toBe('delete_pending');
    expect(result.summary).toMatch(/Delete \*\*Ralph Mendoza\*\*/);
    expect(result.summary).toMatch(/can't be undone/i);
    expect(excludeMemberMock).not.toHaveBeenCalled();
    expect(setMemberRelationshipMock).not.toHaveBeenCalled();
  });

  it('does not guess when a name matches more than one family member', async () => {
    getUserFamilyTreeMock.mockResolvedValueOnce({
      members: [member(), member({ id: 'char-2', name: 'Ralph Ochoa', first_name: 'Ralph', kinship_title: null })],
    });

    const { writeFamilyFromChat } = await import('./familyWriteService');
    await expect(writeFamilyFromChat('user-1', 'delete Ralph')).rejects.toThrow(/more than one match/i);
    expect(excludeMemberMock).not.toHaveBeenCalled();
  });

  it('reports clearly when no family member matches the name', async () => {
    getUserFamilyTreeMock.mockResolvedValueOnce({ members: [] });

    const { writeFamilyFromChat } = await import('./familyWriteService');
    await expect(writeFamilyFromChat('user-1', 'delete Someone Unknown')).rejects.toThrow(/couldn't find/i);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveAccountAuthority, fromMock } = vi.hoisted(() => ({
  resolveAccountAuthority: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('../../lib/accountAuthority', async () => {
  const actual = await vi.importActual<typeof import('../../lib/accountAuthority')>(
    '../../lib/accountAuthority',
  );
  return {
    ...actual,
    resolveAccountAuthority,
  };
});

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('../organizationService', () => ({
  organizationService: {
    listOrganizationLabels: vi.fn().mockResolvedValue([]),
  },
}));

import { addCharacterToDatingBook, DatingBookAddError } from './addCharacterToDatingBook';

const ADMIN_USER = 'user-admin';
const OTHER_USER = 'user-other';
const CHARACTER_ID = '11111111-1111-4111-8111-111111111111';

function characterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHARACTER_ID,
    name: 'Jamie',
    alias: ['Jay'],
    role: 'friend',
    archetype: null,
    metadata: {},
    ...overrides,
  };
}

function chain(result: { data: unknown; error?: unknown }) {
  const query: Record<string, unknown> = {};
  const self = () => query;
  query.select = self;
  query.eq = self;
  query.order = self;
  query.limit = self;
  query.maybeSingle = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null });
  query.single = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null });
  query.update = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  return query;
}

describe('addCharacterToDatingBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccountAuthority.mockResolvedValue({ role: 'admin', isFounderAccount: false });
  });

  it('rejects non-admin accounts before touching another user\'s characters', async () => {
    resolveAccountAuthority.mockResolvedValue({ role: 'standard_user', isFounderAccount: false });

    await expect(
      addCharacterToDatingBook({ userId: OTHER_USER, characterId: CHARACTER_ID }),
    ).rejects.toMatchObject({ status: 403, code: 'dating_add_forbidden' });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects developer accounts', async () => {
    resolveAccountAuthority.mockResolvedValue({ role: 'developer', isFounderAccount: false });

    await expect(
      addCharacterToDatingBook({ userId: OTHER_USER, characterId: CHARACTER_ID }),
    ).rejects.toBeInstanceOf(DatingBookAddError);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not add a character that is not owned by the signed-in user', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') return chain({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      addCharacterToDatingBook({ userId: ADMIN_USER, characterId: CHARACTER_ID }),
    ).rejects.toMatchObject({ status: 404, code: 'dating_add_character_not_found' });
  });

  it('blocks family members', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({ data: characterRow({ name: 'Tío Marcus', role: 'uncle' }) });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      addCharacterToDatingBook({ userId: ADMIN_USER, characterId: CHARACTER_ID }),
    ).rejects.toMatchObject({ status: 400, code: 'dating_add_family_blocked' });
  });

  it('creates a user-confirmed crush row for the signed-in admin only', async () => {
    const created = {
      id: 'rel-new',
      user_id: ADMIN_USER,
      person_id: CHARACTER_ID,
      person_type: 'character',
      relationship_type: 'crush',
      status: 'unrequited',
    };
    const insertQuery = chain({ data: created });
    let romanceCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') return chain({ data: characterRow() });
      if (table === 'romantic_relationships') {
        romanceCalls += 1;
        return romanceCalls === 1 ? chain({ data: null }) : insertQuery;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await addCharacterToDatingBook({
      userId: ADMIN_USER,
      characterId: CHARACTER_ID,
    });

    expect(result.created).toBe(true);
    expect(result.relationship.user_id).toBe(ADMIN_USER);
    expect(result.relationship.person_id).toBe(CHARACTER_ID);
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: ADMIN_USER,
        person_id: CHARACTER_ID,
        relationship_type: 'crush',
        status: 'unrequited',
        metadata: expect.objectContaining({
          user_confirmed_romantic: true,
          correction_source: 'user',
          added_via: 'manual_character_add',
        }),
      }),
    );
  });

  it('returns the existing row instead of duplicating', async () => {
    const existing = {
      id: 'rel-existing',
      user_id: ADMIN_USER,
      person_id: CHARACTER_ID,
      metadata: {},
    };
    const updated = { ...existing, metadata: { user_confirmed_romantic: true } };
    const updateQuery = chain({ data: updated });

    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') return chain({ data: characterRow() });
      if (table === 'romantic_relationships') return updateQuery;
      throw new Error(`unexpected table ${table}`);
    });
    updateQuery.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });

    const result = await addCharacterToDatingBook({
      userId: ADMIN_USER,
      characterId: CHARACTER_ID,
    });

    expect(result.created).toBe(false);
    expect(result.relationship.id).toBe('rel-existing');
    expect(updateQuery.insert).not.toHaveBeenCalled();
  });
});

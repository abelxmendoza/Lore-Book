import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClassifyForCreation,
  mockMergeMention,
  mockRecordPendingQuestion,
  mockRunExclusive,
  mockRecordCoMention,
  mockRegisterCharacterAuthority,
  mockAssignCharacterAvatar,
  mockInsert,
  mockUpdate,
  mockSelectMaybeSingle,
} = vi.hoisted(() => ({
  mockClassifyForCreation: vi.fn(),
  mockMergeMention: vi.fn(),
  mockRecordPendingQuestion: vi.fn(),
  mockRunExclusive: vi.fn(async (_userId: string, fn: () => Promise<unknown>) => fn()),
  mockRecordCoMention: vi.fn(async () => 2),
  mockRegisterCharacterAuthority: vi.fn(async () => undefined),
  mockAssignCharacterAvatar: vi.fn(async () => 'https://avatar.example/v.png'),
  mockInsert: vi.fn(async () => ({ error: null })),
  mockUpdate: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  })),
  mockSelectMaybeSingle: vi.fn(async () => ({ data: { metadata: {} }, error: null })),
}));

vi.mock('../characterRegistry', () => ({
  characterRegistry: {
    runExclusive: mockRunExclusive,
    classifyForCreation: mockClassifyForCreation,
    mergeMention: mockMergeMention,
    recordPendingQuestion: mockRecordPendingQuestion,
  },
}));

vi.mock('../characterConnectionService', () => ({
  characterConnectionService: {
    recordCoMention: mockRecordCoMention,
  },
}));

vi.mock('../characterAuthorityService', () => ({
  characterAuthorityService: {
    registerCharacterAuthority: mockRegisterCharacterAuthority,
  },
}));

vi.mock('../characterAvatarService', () => ({
  assignCharacterAvatar: mockAssignCharacterAvatar,
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'characters') throw new Error(`unexpected table ${table}`);
      return {
        insert: mockInsert,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockSelectMaybeSingle,
            })),
          })),
        })),
        update: mockUpdate,
      };
    }),
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { ensureRelationalPossessorAndLink } from './relationalPossessorService';

describe('ensureRelationalPossessorAndLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunExclusive.mockImplementation(async (_userId: string, fn: () => Promise<unknown>) => fn());
    mockRecordCoMention.mockResolvedValue(2);
    mockInsert.mockResolvedValue({ error: null });
    mockSelectMaybeSingle.mockResolvedValue({ data: { metadata: {} }, error: null });
  });

  it('creates a short-letter possessor for slang possessive labels like "V\'s Homegirl"', async () => {
    mockClassifyForCreation.mockResolvedValue({ action: 'create', cleanName: 'V' });

    const result = await ensureRelationalPossessorAndLink(
      'user-1',
      "V's Homegirl",
      'placeholder-1',
    );

    expect(mockClassifyForCreation).toHaveBeenCalledWith('user-1', 'V', {
      sourceEntityType: 'person',
      allowShortAnchor: true,
    });
    expect(mockInsert).toHaveBeenCalled();
    const insertPayload = mockInsert.mock.calls[0][0];
    expect(insertPayload.name).toBe('V');
    expect(insertPayload.metadata.generated_by).toBe('relational_possessor');
    expect(insertPayload.metadata.from_placeholder_character_id).toBe('placeholder-1');
    expect(mockRecordCoMention).toHaveBeenCalledWith('user-1', ['placeholder-1', insertPayload.id]);
    expect(result.created).toBe(true);
    expect(result.possessorId).toBe(insertPayload.id);
    expect(result.anchor).toBe('V');
    expect(result.relation).toBe('homegirl');
  });

  it('merges into an existing anchor for "Taylor\'s friend"', async () => {
    mockClassifyForCreation.mockResolvedValue({
      action: 'merge',
      characterId: 'taylor-id',
      matchedName: 'Taylor',
      cleanName: 'Taylor',
    });

    const result = await ensureRelationalPossessorAndLink(
      'user-1',
      "Taylor's friend",
      'placeholder-2',
    );

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockMergeMention).toHaveBeenCalledWith(
      'user-1',
      'taylor-id',
      'Taylor',
      expect.objectContaining({ relational_possessor_of: 'placeholder-2' }),
    );
    expect(mockRecordCoMention).toHaveBeenCalledWith('user-1', ['placeholder-2', 'taylor-id']);
    expect(result).toMatchObject({
      possessorId: 'taylor-id',
      created: false,
      linked: true,
      anchor: 'Taylor',
      relation: 'friend',
    });
  });

  it('no-ops for ordinary non-relational names', async () => {
    const result = await ensureRelationalPossessorAndLink('user-1', 'Marcus', 'char-1');
    expect(result.skippedReason).toBe('not_relational_placeholder');
    expect(mockClassifyForCreation).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

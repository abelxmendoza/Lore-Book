import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockResolveCharacterByName, mockRecordMutation } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockResolveCharacterByName: vi.fn(),
  mockRecordMutation: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock('../../services/identity/identityLedgerService', () => ({
  identityLedgerService: { recordMutation: mockRecordMutation },
}));

vi.mock('./foundationRecallDataService', () => ({
  resolveCharacterByName: mockResolveCharacterByName,
}));

import { writeRomanceFromChat } from './romanceWriteService';

describe('writeRomanceFromChat', () => {
  const update = vi.fn();
  const updateFirstEq = vi.fn();
  const updateSecondEq = vi.fn();
  const maybeSingle = vi.fn();
  const lookupLimit = vi.fn();
  const lookupOrder = vi.fn();
  const lookupFirstEq = vi.fn();
  const lookupSecondEq = vi.fn();
  const lookupThirdEq = vi.fn();
  const select = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    update.mockReturnValue({ eq: updateFirstEq });
    updateFirstEq.mockReturnValue({ eq: updateSecondEq });
    updateSecondEq.mockResolvedValue({ error: null });

    maybeSingle.mockResolvedValue({
      data: {
        id: 'rel-001',
        status: 'active',
        metadata: { evidence_source: 'chat' },
      },
      error: null,
    });
    lookupLimit.mockReturnValue({ maybeSingle });
    lookupOrder.mockReturnValue({ limit: lookupLimit });
    lookupThirdEq.mockReturnValue({ order: lookupOrder });
    lookupSecondEq.mockReturnValue({ eq: lookupThirdEq });
    lookupFirstEq.mockReturnValue({ eq: lookupSecondEq });
    select.mockReturnValue({ eq: lookupFirstEq });

    mockFrom.mockReturnValue({ select, update });
    mockResolveCharacterByName.mockResolvedValue({ id: 'char-001', name: 'Marcus' });
    mockRecordMutation.mockResolvedValue(undefined);
  });

  it('maps inactive to ended and persists the user reason', async () => {
    const result = await writeRomanceFromChat(
      'user-001',
      'mark Marcus as inactive because we drifted apart',
    );

    expect(result).toMatchObject({
      operation: 'status',
      relationshipId: 'rel-001',
      partnerName: 'Marcus',
      status: 'ended',
    });
    expect(result.summary).toContain('inactive');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ended',
        is_current: false,
        metadata: expect.objectContaining({
          status_source: 'user_confirmed',
          last_user_correction: expect.objectContaining({
            reason: 'user_corrected_status_via_chat',
            reason_note: 'we drifted apart',
          }),
        }),
      }),
    );
    expect(mockRecordMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'rel-001',
        reason: 'user_corrected_status_via_chat',
        metadata: expect.objectContaining({ reason_note: 'we drifted apart' }),
      }),
    );
  });
});

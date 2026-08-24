import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown };
let tableResults: Record<string, TableResult> = {};
const updateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

function makeChain(table: string, result: TableResult) {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'maybeSingle']) {
    chain[key] = () => chain;
  }
  chain.update = (payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return chain;
  };
  chain.then = (resolve: (v: TableResult) => void) => resolve(result);
  return chain;
}

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(table, tableResults[table] ?? { data: null, error: null })),
  },
}));

const deleteCharacterMock = vi.fn().mockResolvedValue({ characterId: 'char-1' });
vi.mock('../../characterDeletionService', () => ({
  characterDeletionService: { deleteCharacter: (...args: unknown[]) => deleteCharacterMock(...args) },
}));

vi.mock('../../characterMergeService', () => ({ characterMergeService: {} }));

import { characterCardRescanAuditService } from './characterCardRescanAuditService';

const USER = 'user-1';
const CHAR = 'char-1';

describe('characterCardRescanAuditService.resolveReviewSuggestion', () => {
  beforeEach(() => {
    updateCalls.length = 0;
    deleteCharacterMock.mockClear();
    tableResults = {
      characters: { data: { status: 'archived' }, error: null },
    };
  });

  it('queues an archived character for pending_deletion before permanently deleting it', async () => {
    const result = await characterCardRescanAuditService.resolveReviewSuggestion(USER, CHAR, 'delete');

    expect(result).toEqual({ success: true });
    const queueUpdate = updateCalls.find((c) => c.payload.status === 'pending_deletion');
    expect(queueUpdate).toBeDefined();
    expect(deleteCharacterMock).toHaveBeenCalledWith(
      USER,
      CHAR,
      expect.objectContaining({ reason: 'character_card_audit_review_rejected' })
    );
    const deleteCallOrder = updateCalls.findIndex((c) => c.payload.status === 'pending_deletion');
    expect(deleteCallOrder).toBe(0);
    expect(deleteCharacterMock.mock.invocationCallOrder[0]).toBeGreaterThan(0);
  });

  it('returns character_not_found instead of throwing when the character is gone', async () => {
    tableResults = { characters: { data: null, error: null } };

    const result = await characterCardRescanAuditService.resolveReviewSuggestion(USER, CHAR, 'delete');

    expect(result).toEqual({ success: false, error: 'character_not_found' });
    expect(deleteCharacterMock).not.toHaveBeenCalled();
  });
});

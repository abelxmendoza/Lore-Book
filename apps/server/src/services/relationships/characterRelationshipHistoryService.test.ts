import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  listCurrentCharacterRelationships,
  loadCharacterRelationshipHistory,
} from './characterRelationshipHistoryService';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'or', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('characterRelationshipHistoryService', () => {
  const userFilters: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    userFilters.length = 0;
    mockFrom.mockImplementation((table: string) => {
      const result = { data: [], error: null };
      const builder = chain(result);
      const originalEq = builder.eq as (col: string, val: unknown) => unknown;
      builder.eq = vi.fn((col: string, val: unknown) => {
        if (col === 'user_id') userFilters.push(String(val));
        return originalEq(col, val);
      });
      return builder;
    });
  });

  it('loads history only for the requesting tenant', async () => {
    await loadCharacterRelationshipHistory('user-a', { characterId: 'char-jamie' });
    expect(userFilters[0]).toBe('user-a');
    expect(userFilters).not.toContain('user-b');
  });

  it('maps live ledger columns (change_kind, not assertion_kind)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationship_history') {
        return chain({
          data: [
            {
              id: 'hist-1',
              user_id: 'user-a',
              source_character_id: 'char-jamie',
              target_character_id: 'char-marcus',
              from_relationship_type: null,
              from_status: null,
              to_relationship_type: 'friend',
              to_status: 'active',
              changed_at: '2026-04-01T00:00:00.000Z',
              recorded_at: '2026-04-01T12:00:00.000Z',
              valid_until: null,
              change_kind: 'CREATED',
              authority: 'USER_EXPLICIT',
              evidence_ids: [],
              confidence: 1,
              relationship_id: null,
              corrects_history_id: null,
              idempotency_key: 'k1',
            },
          ],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const rows = await loadCharacterRelationshipHistory('user-a', { characterId: 'char-jamie' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.relationshipType).toBe('friend');
    expect(rows[0]?.assertionKind).toBe('asserted');
    expect(rows[0]?.authority).toBe('USER_EXPLICIT');
    expect(rows[0]?.validFrom).toBe('2026-04-01T00:00:00.000Z');
  });

  it('does not let a history pair resurrect ended cache rows from another pair', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationship_history') {
        return chain({
          data: [
            {
              id: 'hist-1',
              user_id: 'user-a',
              source_character_id: 'char-jamie',
              target_character_id: 'char-marcus',
              from_relationship_type: 'friend',
              from_status: 'active',
              to_relationship_type: 'friend',
              to_status: 'ended',
              changed_at: '2026-07-01T00:00:00.000Z',
              recorded_at: '2026-08-20T12:00:00.000Z',
              valid_until: '2026-07-01T00:00:00.000Z',
              change_kind: 'ENDED',
              authority: 'USER_EXPLICIT',
              evidence_ids: [],
              confidence: 1,
              relationship_id: null,
              corrects_history_id: null,
              idempotency_key: 'k1',
            },
          ],
          error: null,
        });
      }
      return chain({
        data: [
          {
            id: 'cache-ended-pair',
            relationship_type: 'friend',
            status: 'active',
            source_character_id: 'char-jamie',
            target_character_id: 'char-marcus',
            metadata: {},
          },
          {
            id: 'cache-other-pair',
            relationship_type: 'coworker',
            status: 'active',
            source_character_id: 'char-jamie',
            target_character_id: 'char-taylor',
            metadata: {},
          },
        ],
        error: null,
      });
    });

    const current = await listCurrentCharacterRelationships('user-a', { characterId: 'char-jamie' });
    expect(current.some((row) => row.id === 'cache-ended-pair')).toBe(false);
    expect(current.some((row) => row.id === 'cache-other-pair')).toBe(true);
  });
});

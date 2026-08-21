import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import {
  applyCharacterRelationshipWrite,
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
      const result =
        table === 'character_relationship_history'
          ? { data: [], error: null }
          : { data: [], error: null };
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

  it('rejects writes from a different actor', async () => {
    const result = await applyCharacterRelationshipWrite({
      userId: 'user-a',
      actorId: 'user-b',
      sourceCharacterId: 'char-jamie',
      targetCharacterId: 'char-marcus',
      relationshipType: 'friend',
      intent: 'assert',
      authority: 'USER_EXPLICIT',
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/own/i);
  });

  it('skips a no-op assert when the current projection already has that state', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationships') {
        return chain({
          data: [{
            id: 'rel-1',
            relationship_type: 'friend',
            status: 'active',
            source_character_id: 'char-jamie',
            target_character_id: 'char-marcus',
            metadata: {},
            updated_at: '2026-08-20T12:00:00.000Z',
          }],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const result = await applyCharacterRelationshipWrite({
      userId: 'user-a',
      actorId: 'user-a',
      sourceCharacterId: 'char-jamie',
      targetCharacterId: 'char-marcus',
      relationshipType: 'friend',
      intent: 'assert',
      authority: 'SYSTEM_INFERENCE',
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unchanged_canonical_state');
  });

  it('rejects destructive delete without USER_EXPLICIT', async () => {
    const result = await applyCharacterRelationshipWrite({
      userId: 'user-a',
      actorId: 'user-a',
      sourceCharacterId: 'char-jamie',
      targetCharacterId: 'char-marcus',
      relationshipType: 'friend',
      intent: 'destroy',
      authority: 'SYSTEM_INFERENCE',
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/explicit/i);
  });

  it('does not let a history pair resurrect ended cache rows from another pair', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationship_history') {
        return chain({
          data: [{
            id: 'hist-1',
            user_id: 'user-a',
            source_character_id: 'char-jamie',
            target_character_id: 'char-marcus',
            pair_key: 'char-jamie::char-marcus',
            relationship_type: 'friend',
            assertion_kind: 'ended',
            authority: 'USER_EXPLICIT',
            recorded_at: '2026-08-20T12:00:00.000Z',
            valid_from: '2026-07-01T00:00:00.000Z',
            valid_until: '2026-07-01T00:00:00.000Z',
            valid_precision: 'month',
            superseded_by_id: null,
            idempotency_key: 'k1',
            source_message_id: null,
            evidence: null,
            confidence: 1,
          }],
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

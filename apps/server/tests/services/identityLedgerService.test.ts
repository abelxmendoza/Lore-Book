import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  buildMutationRow,
  summarizeMutation,
  identityLedgerService,
  IDENTITY_MUTATION_TYPES,
} from '../../src/services/identity/identityLedgerService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

/** Chainable query-builder mock that resolves to `result` when awaited, and
 *  whose `.single()` resolves to `single`. Captures the insert payload. */
function makeChain(result: { data: unknown; error: unknown }, single?: { data: unknown; error: unknown }) {
  const captured: { insert?: unknown } = {};
  const chain: any = {
    insert: vi.fn((payload: unknown) => { captured.insert = payload; return chain; }),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(single ?? result)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { chain, captured };
}

describe('IdentityLedger — buildMutationRow', () => {
  it('normalizes optional fields with safe defaults', () => {
    const row = buildMutationRow({
      userId: 'u1',
      entityId: 'e1',
      entityType: 'character',
      mutationType: 'ENTITY_CREATED',
    });
    expect(row).toMatchObject({
      user_id: 'u1',
      entity_id: 'e1',
      entity_type: 'character',
      mutation_type: 'ENTITY_CREATED',
      previous_value: null,
      new_value: null,
      reason: null,
      confidence: null,
      source: 'SYSTEM',
      metadata: {},
    });
  });

  it('carries through provided values', () => {
    const row = buildMutationRow({
      userId: 'u1',
      entityId: 'e1',
      entityType: 'location',
      mutationType: 'ENTITY_MERGED',
      previousValue: { name: 'old' },
      newValue: { name: 'new' },
      reason: 'dup',
      confidence: 0.9,
      source: 'USER',
      metadata: { sourceId: 's1' },
    });
    expect(row.previous_value).toEqual({ name: 'old' });
    expect(row.new_value).toEqual({ name: 'new' });
    expect(row.confidence).toBe(0.9);
    expect(row.source).toBe('USER');
    expect(row.metadata).toEqual({ sourceId: 's1' });
  });

  it('covers every documented mutation type label', () => {
    for (const t of IDENTITY_MUTATION_TYPES) {
      const label = summarizeMutation({ mutation_type: t, entity_type: 'character', reason: null });
      expect(label).toBeTruthy();
    }
  });
});

describe('IdentityLedger — recordMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts an append-only row and returns the new id', async () => {
    const { chain, captured } = makeChain({ data: [], error: null }, { data: { id: 'mut-1' }, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain);

    const id = await identityLedgerService.recordMutation({
      userId: 'u1',
      entityId: 'e1',
      entityType: 'character',
      mutationType: 'ENTITY_CREATED',
      newValue: { name: 'Reese' },
      source: 'USER',
    });

    expect(supabaseAdmin.from).toHaveBeenCalledWith('identity_mutations');
    expect(captured.insert).toMatchObject({
      user_id: 'u1',
      entity_id: 'e1',
      mutation_type: 'ENTITY_CREATED',
      new_value: { name: 'Reese' },
      source: 'USER',
    });
    expect(id).toBe('mut-1');
  });

  it('skips and returns null when userId/entityId is missing', async () => {
    const id = await identityLedgerService.recordMutation({
      userId: '',
      entityId: 'e1',
      entityType: 'character',
      mutationType: 'ENTITY_CREATED',
    });
    expect(id).toBeNull();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('never throws and returns null when the DB errors', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'boom' } }, { data: null, error: { message: 'boom' } });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain);

    const id = await identityLedgerService.recordMutation({
      userId: 'u1',
      entityId: 'e1',
      entityType: 'character',
      mutationType: 'ENTITY_UPDATED',
    });
    expect(id).toBeNull();
  });
});

describe('IdentityLedger — reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMutationTimeline maps rows into summarized newest-first entries', async () => {
    const rows = [
      { id: 'm2', user_id: 'u1', entity_id: 'e1', entity_type: 'character', mutation_type: 'ENTITY_MERGED',
        previous_value: { name: 'a' }, new_value: { name: 'b' }, reason: 'dup', confidence: null, source: 'USER',
        metadata: {}, created_at: '2026-06-19T10:00:00Z' },
      { id: 'm1', user_id: 'u1', entity_id: 'e1', entity_type: 'character', mutation_type: 'ENTITY_CREATED',
        previous_value: null, new_value: { name: 'a' }, reason: null, confidence: null, source: 'PIPELINE',
        metadata: {}, created_at: '2026-06-19T09:00:00Z' },
    ];
    const { chain } = makeChain({ data: rows, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain);

    const timeline = await identityLedgerService.getMutationTimeline('u1', 'e1');
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ id: 'm2', mutationType: 'ENTITY_MERGED', summary: 'character merged', source: 'USER' });
    expect(timeline[1]).toMatchObject({ id: 'm1', mutationType: 'ENTITY_CREATED', summary: 'character created' });
  });

  it('getRecentMutations returns [] on error rather than throwing', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'nope' } });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain);
    const rows = await identityLedgerService.getRecentMutations('u1');
    expect(rows).toEqual([]);
  });
});

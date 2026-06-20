import { describe, it, expect, vi } from 'vitest';

// Avoid initializing the real Supabase client (env/side effects) in unit tests.
vi.mock('../supabaseClient', () => ({ supabaseAdmin: {} }));

import {
  buildMemoryEventRow,
  appendMemoryEvent,
  appendMemoryEvents,
  getRecentMemoryEvents,
  getMemoryEventsForEntity,
  MEMORY_EVENT_KINDS,
  type MemoryEventClient,
  type MemoryEventRow,
} from './memoryEventService';

// ── Mock client helpers ─────────────────────────────────────────────────────
function insertClient(result: { data?: unknown; error?: unknown } | (() => never)) {
  const insert = vi.fn(async (_rows: MemoryEventRow[]) =>
    typeof result === 'function' ? result() : result
  );
  const client = { from: vi.fn(() => ({ insert, select: vi.fn() })) } as unknown as MemoryEventClient;
  return { client, insert };
}

function selectClient(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, unknown]> = [];
  const query: Record<string, unknown> = {};
  query.eq = vi.fn((col: string, val: unknown) => {
    calls.push([col, val]);
    return query;
  });
  query.order = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  const select = vi.fn(() => query);
  const client = { from: vi.fn(() => ({ select, insert: vi.fn() })) } as unknown as MemoryEventClient;
  return { client, calls, query };
}

const base = { userId: 'user-1', kind: 'user_message' as const };

describe('buildMemoryEventRow', () => {
  it('applies sensible defaults', () => {
    const row = buildMemoryEventRow(base);
    expect(row.user_id).toBe('user-1');
    expect(row.kind).toBe('user_message');
    expect(row.actor).toBe('user');
    expect(row.user_confirmed).toBe(false);
    expect(row.payload).toEqual({});
    expect(row.confidence).toBeNull();
    expect(row.session_id).toBeNull();
    expect(row.supersedes_event_id).toBeNull();
    expect(typeof row.occurred_at).toBe('string');
  });

  it('clamps confidence into [0,1] and coerces invalid values to null', () => {
    expect(buildMemoryEventRow({ ...base, confidence: 1.5 }).confidence).toBe(1);
    expect(buildMemoryEventRow({ ...base, confidence: -0.2 }).confidence).toBe(0);
    expect(buildMemoryEventRow({ ...base, confidence: 0.42 }).confidence).toBe(0.42);
    expect(buildMemoryEventRow({ ...base, confidence: NaN }).confidence).toBeNull();
    expect(buildMemoryEventRow({ ...base, confidence: Infinity }).confidence).toBeNull();
  });

  it('passes through provenance + supersession fields', () => {
    const row = buildMemoryEventRow({
      ...base,
      kind: 'correction',
      actor: 'user',
      sessionId: 's1',
      sourceMessageId: 'm1',
      entityId: 'e1',
      extractionMethod: 'user_provided',
      userConfirmed: true,
      content: 'actually her name is Maya',
      payload: { field: 'name' },
      supersedesEventId: 'evt-old',
    });
    expect(row).toMatchObject({
      kind: 'correction',
      session_id: 's1',
      source_message_id: 'm1',
      entity_id: 'e1',
      extraction_method: 'user_provided',
      user_confirmed: true,
      content: 'actually her name is Maya',
      payload: { field: 'name' },
      supersedes_event_id: 'evt-old',
    });
  });

  it('normalizes occurredAt: Date → ISO, string passthrough, missing → now', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(buildMemoryEventRow({ ...base, occurredAt: d }).occurred_at).toBe('2026-01-02T03:04:05.000Z');
    expect(buildMemoryEventRow({ ...base, occurredAt: '2026-05-05T00:00:00Z' }).occurred_at).toBe(
      '2026-05-05T00:00:00Z'
    );
    expect(buildMemoryEventRow({ ...base, occurredAt: '   ' }).occurred_at).not.toBe('   ');
  });

  it('rejects structurally-invalid input (programming errors surface)', () => {
    expect(() => buildMemoryEventRow({ ...base, userId: '' })).toThrow(/userId/);
    expect(() => buildMemoryEventRow({ ...base, kind: 'nope' as never })).toThrow(/invalid kind/);
    expect(() => buildMemoryEventRow({ ...base, actor: 'robot' as never })).toThrow(/invalid actor/);
  });

  it('covers every declared event kind', () => {
    for (const kind of MEMORY_EVENT_KINDS) {
      expect(buildMemoryEventRow({ ...base, kind }).kind).toBe(kind);
    }
  });
});

describe('appendMemoryEvent (fail-open)', () => {
  it('inserts the built row and returns true on success', async () => {
    const { client, insert } = insertClient({ error: null });
    const ok = await appendMemoryEvent({ ...base, content: 'hi' }, client);
    expect(ok).toBe(true);
    const inserted = insert.mock.calls[0]![0][0]!;
    expect(inserted.user_id).toBe('user-1');
    expect(inserted.content).toBe('hi');
  });

  it('returns false (no throw) when the DB returns an error', async () => {
    const { client } = insertClient({ error: { message: 'boom' } });
    await expect(appendMemoryEvent(base, client)).resolves.toBe(false);
  });

  it('returns false (no throw) when the insert throws', async () => {
    const { client } = insertClient(() => {
      throw new Error('network down');
    });
    await expect(appendMemoryEvent(base, client)).resolves.toBe(false);
  });

  it('returns false for malformed input without throwing', async () => {
    const { client, insert } = insertClient({ error: null });
    await expect(appendMemoryEvent({ ...base, kind: 'bad' as never }, client)).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('appendMemoryEvents (batch, fail-open)', () => {
  it('inserts valid rows and skips malformed ones', async () => {
    const { client, insert } = insertClient({ error: null });
    const count = await appendMemoryEvents(
      [base, { ...base, kind: 'bad' as never }, { ...base, kind: 'inference' }],
      client
    );
    expect(count).toBe(2);
    expect(insert.mock.calls[0]![0].length).toBe(2);
  });

  it('returns 0 for empty input and does not call the DB', async () => {
    const { client, insert } = insertClient({ error: null });
    expect(await appendMemoryEvents([], client)).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 0 (no throw) when the DB errors', async () => {
    const { client } = insertClient({ error: { message: 'nope' } });
    await expect(appendMemoryEvents([base], client)).resolves.toBe(0);
  });
});

describe('getRecentMemoryEvents (fail-open)', () => {
  it('returns rows on success and applies the kind filter', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const { client, calls } = selectClient({ data: rows, error: null });
    const out = await getRecentMemoryEvents('user-1', { kind: 'correction', limit: 50 }, client);
    expect(out).toEqual(rows);
    expect(calls).toContainEqual(['user_id', 'user-1']);
    expect(calls).toContainEqual(['kind', 'correction']);
  });

  it('returns [] when the DB errors', async () => {
    const { client } = selectClient({ data: null, error: { message: 'x' } });
    await expect(getRecentMemoryEvents('user-1', {}, client)).resolves.toEqual([]);
  });
});

describe('getMemoryEventsForEntity (fail-open)', () => {
  it('filters by user and entity', async () => {
    const { client, calls } = selectClient({ data: [{ id: 'a' }], error: null });
    const out = await getMemoryEventsForEntity('user-1', 'entity-9', {}, client);
    expect(out).toEqual([{ id: 'a' }]);
    expect(calls).toContainEqual(['user_id', 'user-1']);
    expect(calls).toContainEqual(['entity_id', 'entity-9']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../config', () => ({ config: { defaultModel: 'test-model' } }));
vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/openai', () => ({ openai: {} }));
vi.mock('../conversationCentered/ingestionPipeline', () => ({ conversationIngestionPipeline: {} }));
vi.mock('../memoryReviewQueueService', () => ({ memoryReviewQueueService: {} }));
vi.mock('../omegaMemoryService', () => ({ omegaMemoryService: {} }));
vi.mock('../perspectiveService', () => ({ perspectiveService: {} }));

type BuilderResult = { data: unknown; error: unknown };

/** Chainable supabase query builder that resolves select/maybeSingle/single chains. */
function builderResolving(result: BuilderResult, calls?: Array<{ method: string; args: unknown[] }>) {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls?.push({ method, args });
      return builder;
    });
  builder.select = chain('select');
  builder.insert = chain('insert');
  builder.update = chain('update');
  builder.eq = chain('eq');
  builder.order = chain('order');
  builder.limit = chain('limit');
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.single = vi.fn().mockResolvedValue(result);
  Object.assign(builder, {
    then(onFulfilled: (v: BuilderResult) => unknown) {
      return Promise.resolve(onFulfilled(result));
    },
  });
  return builder;
}

describe('getOrCreateChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('only ever touches conversation_sessions — never the legacy chat_sessions table', async () => {
    const tables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      tables.push(table);
      return builderResolving({ data: table === 'conversation_sessions' ? { id: 'new-id' } : null, error: null });
    });

    const { getOrCreateChatSession } = await import('./chatPersistenceService');
    await getOrCreateChatSession('user-1');

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.every((t) => t === 'conversation_sessions')).toBe(true);
  });

  it('reuses a recent quick-chat session', async () => {
    const recent = { id: 'quick-1', updated_at: new Date().toISOString() };
    let selectCall = 0;
    mockFrom.mockImplementation(() => {
      selectCall += 1;
      return builderResolving({ data: selectCall === 1 ? recent : null, error: null });
    });

    const { getOrCreateChatSession } = await import('./chatPersistenceService');
    const id = await getOrCreateChatSession('user-1');

    expect(id).toBe('quick-1');
  });

  it('creates a new conversation_sessions row when the quick-chat session is stale', async () => {
    const stale = { id: 'quick-old', updated_at: new Date(Date.now() - 48 * 3600_000).toISOString() };
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      // First call: lookup returns stale session; second call: insert returns new row.
      return builderResolving({ data: call === 1 ? stale : { id: 'fresh-id' }, error: null });
    });

    const { getOrCreateChatSession } = await import('./chatPersistenceService');
    const id = await getOrCreateChatSession('user-1');

    expect(id).toBe('fresh-id');
  });

  it('throws instead of returning a random session id when creation fails', async () => {
    mockFrom.mockImplementation(() => builderResolving({ data: null, error: { message: 'db down' } }));

    const { getOrCreateChatSession } = await import('./chatPersistenceService');
    await expect(getOrCreateChatSession('user-1')).rejects.toThrow(/chat session/i);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for the conversation ingestion pipeline's orchestration
 * surface (`ingestFromChatMessage`, `ensureConversationSession`) and its
 * input-validation / error-handling guarantees.
 *
 * The full `ingestMessageCore` fan-out touches dozens of services and is covered
 * separately; here we mock Supabase and spy on `ingestMessage` so we can pin the
 * branching and the "ingestion must never throw into chat" contract.
 */

// ── Shared, table-aware Supabase mock ────────────────────────────────────────
type Resp = { data: unknown; error: unknown };
type RouteCtx = { op: string; terminal: 'single' | 'maybeSingle' | 'then'; ordered: boolean };

const h = vi.hoisted(() => {
  const routes: Record<string, (ctx: { op: string; terminal: string; ordered: boolean }) => Resp> = {};
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];

  function makeBuilder(table: string) {
    let op = 'select';
    let ordered = false;
    const result = (terminal: string): Resp => {
      const fn = routes[table];
      return fn ? fn({ op, terminal, ordered }) : { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: vi.fn((..._a: unknown[]) => builder),
      insert: vi.fn((...a: unknown[]) => {
        op = 'insert';
        calls.push({ table, op: 'insert', args: a });
        return builder;
      }),
      update: vi.fn((...a: unknown[]) => {
        op = 'update';
        calls.push({ table, op: 'update', args: a });
        return builder;
      }),
      upsert: vi.fn((...a: unknown[]) => {
        op = 'upsert';
        calls.push({ table, op: 'upsert', args: a });
        return builder;
      }),
      delete: vi.fn(() => {
        op = 'delete';
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      or: vi.fn(() => builder),
      order: vi.fn(() => {
        ordered = true;
        return builder;
      }),
      limit: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(result('single'))),
      maybeSingle: vi.fn(() => Promise.resolve(result('maybeSingle'))),
      then: (onF: (v: Resp) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(result('then')).then(onF, onR),
    };
    return builder;
  }

  const supabaseAdmin = { from: vi.fn((table: string) => makeBuilder(table)) };
  const scheduleInference = vi.fn();
  const scheduleEpisode = vi.fn();
  return {
    supabaseAdmin,
    scheduleInference,
    scheduleEpisode,
    calls,
    setRoute: (table: string, fn: (ctx: { op: string; terminal: string }) => Resp) => {
      routes[table] = fn;
    },
    reset: () => {
      for (const k of Object.keys(routes)) delete routes[k];
      calls.length = 0;
    },
  };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: h.supabaseAdmin }));

vi.mock('../../src/services/inference/inferenceOrchestrator', () => ({
  inferenceOrchestrator: { schedule: h.scheduleInference },
}));

vi.mock('../../src/services/conversationCentered/episodeSegmentationTrigger', () => ({
  episodeSegmentationTrigger: { schedule: h.scheduleEpisode },
}));

const scheduleInference = h.scheduleInference;
const scheduleEpisode = h.scheduleEpisode;

import { conversationIngestionPipeline } from '../../src/services/conversationCentered/ingestionPipeline';

const setRoute = h.setRoute as (
  table: string,
  fn: (ctx: RouteCtx) => Resp,
) => void;

describe('ConversationIngestionPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.reset();
  });

  describe('ingestMessage – input validation', () => {
    it('throws when userId is missing', async () => {
      await expect(
        conversationIngestionPipeline.ingestMessage('', 'thread-1', 'USER', 'hi'),
      ).rejects.toThrow(/userId is required/);
    });

    it('throws when threadId is missing', async () => {
      await expect(
        conversationIngestionPipeline.ingestMessage('user-1', '', 'USER', 'hi'),
      ).rejects.toThrow(/threadId is required/);
    });

    it('throws on an invalid sender', async () => {
      await expect(
        conversationIngestionPipeline.ingestMessage(
          'user-1',
          'thread-1',
          'BOT' as unknown as 'USER',
          'hi',
        ),
      ).rejects.toThrow(/sender must be/);
    });

    it('skips empty/whitespace text and returns an empty result without touching the DB', async () => {
      const result = await conversationIngestionPipeline.ingestMessage(
        'user-1',
        'thread-1',
        'USER',
        '   \n  ',
      );
      expect(result).toEqual({
        messageId: '',
        utteranceIds: [],
        unitIds: [],
        resolvedEntityIds: [],
        resolvedLocationIds: [],
      });
      expect(h.supabaseAdmin.from).not.toHaveBeenCalled();
    });
  });

  describe('ingestFromChatMessage – branch handling', () => {
    it('returns quietly when the chat message is not found', async () => {
      setRoute('chat_messages', () => ({ data: null, error: { message: 'not found' } }));
      const spy = vi
        .spyOn(conversationIngestionPipeline, 'ingestMessage')
        .mockResolvedValue({
          messageId: 'm',
          utteranceIds: [],
          unitIds: [],
          resolvedEntityIds: [],
          resolvedLocationIds: [],
        });

      await conversationIngestionPipeline.ingestFromChatMessage(
        'user-1',
        'chat-1',
        'session-1',
      );

      expect(spy).not.toHaveBeenCalled();
      expect(scheduleInference).not.toHaveBeenCalled();
    });

    it('skips chat messages with empty content', async () => {
      setRoute('chat_messages', () => ({
        data: { id: 'chat-1', role: 'user', content: '   ', metadata: {} },
        error: null,
      }));
      const spy = vi
        .spyOn(conversationIngestionPipeline, 'ingestMessage')
        .mockResolvedValue({
          messageId: 'm',
          utteranceIds: [],
          unitIds: [],
          resolvedEntityIds: [],
          resolvedLocationIds: [],
        });

      await conversationIngestionPipeline.ingestFromChatMessage(
        'user-1',
        'chat-1',
        'session-1',
      );

      expect(spy).not.toHaveBeenCalled();
    });

    it('skips messages already ingested (no force)', async () => {
      setRoute('chat_messages', () => ({
        data: { id: 'chat-1', role: 'user', content: 'hello world', metadata: {} },
        error: null,
      }));
      setRoute('conversation_messages', ({ terminal }) =>
        terminal === 'single'
          ? { data: { id: 'existing-conv-msg' }, error: null }
          : { data: null, error: null },
      );
      const spy = vi
        .spyOn(conversationIngestionPipeline, 'ingestMessage')
        .mockResolvedValue({
          messageId: 'm',
          utteranceIds: [],
          unitIds: [],
          resolvedEntityIds: [],
          resolvedLocationIds: [],
        });

      await conversationIngestionPipeline.ingestFromChatMessage(
        'user-1',
        'chat-1',
        'session-1',
      );

      expect(spy).not.toHaveBeenCalled();
    });

    it('processes a new message: ingests, schedules inference + episode segmentation', async () => {
      setRoute('chat_messages', () => ({
        data: { id: 'chat-1', role: 'user', content: 'I love hiking', metadata: {} },
        error: null,
      }));
      // not already ingested
      setRoute('conversation_messages', () => ({ data: null, error: null }));
      // ensureConversationSession: direct-id lookup returns the session directly
      setRoute('conversation_sessions', ({ terminal }) =>
        terminal === 'then'
          ? { data: [{ id: 'session-1' }], error: null }
          : { data: { id: 'session-1' }, error: null },
      );

      const spy = vi
        .spyOn(conversationIngestionPipeline, 'ingestMessage')
        .mockResolvedValue({
          messageId: 'conv-msg-1',
          utteranceIds: [],
          unitIds: ['u1'],
          resolvedEntityIds: [],
          resolvedLocationIds: [],
        });

      await conversationIngestionPipeline.ingestFromChatMessage(
        'user-1',
        'chat-1',
        'session-1',
        undefined,
        false,
      );

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        'user-1',
        'session-1',
        'USER',
        'I love hiking',
        undefined,
        undefined,
        undefined,
        { chatMessageId: 'chat-1' },
      );
      expect(scheduleInference).toHaveBeenCalledWith('user-1', 'chat_message');
      expect(scheduleEpisode).toHaveBeenCalledWith('user-1', 'session-1');
    });

    it('force re-ingest bypasses the already-ingested guard', async () => {
      setRoute('chat_messages', () => ({
        data: { id: 'chat-1', role: 'assistant', content: 'a reply', metadata: {} },
        error: null,
      }));
      // Even though an existing conv message exists, force=true must proceed
      setRoute('conversation_messages', ({ terminal }) =>
        terminal === 'single'
          ? { data: { id: 'existing' }, error: null }
          : { data: null, error: null },
      );
      setRoute('conversation_sessions', ({ terminal }) =>
        terminal === 'then'
          ? { data: [{ id: 'session-1' }], error: null }
          : { data: { id: 'session-1' }, error: null },
      );

      const spy = vi
        .spyOn(conversationIngestionPipeline, 'ingestMessage')
        .mockResolvedValue({
          messageId: 'conv-msg-2',
          utteranceIds: [],
          unitIds: [],
          resolvedEntityIds: [],
          resolvedLocationIds: [],
        });

      await conversationIngestionPipeline.ingestFromChatMessage(
        'user-1',
        'chat-1',
        'session-1',
        undefined,
        true,
      );

      expect(spy).toHaveBeenCalledTimes(1);
      // sender mapped from role 'assistant' → 'AI'
      expect(spy.mock.calls[0][2]).toBe('AI');
    });

    it('never throws when ingestMessage fails (non-blocking contract)', async () => {
      setRoute('chat_messages', () => ({
        data: { id: 'chat-1', role: 'user', content: 'boom', metadata: {} },
        error: null,
      }));
      setRoute('conversation_messages', () => ({ data: null, error: null }));
      setRoute('conversation_sessions', ({ terminal }) =>
        terminal === 'then'
          ? { data: [{ id: 'session-1' }], error: null }
          : { data: { id: 'session-1' }, error: null },
      );

      vi.spyOn(conversationIngestionPipeline, 'ingestMessage').mockRejectedValue(
        new Error('downstream exploded'),
      );

      await expect(
        conversationIngestionPipeline.ingestFromChatMessage('user-1', 'chat-1', 'session-1'),
      ).resolves.toBeUndefined();

      // Failure short-circuits before scheduling follow-up work.
      expect(scheduleInference).not.toHaveBeenCalled();
    });
  });

  describe('ensureConversationSession', () => {
    const call = (userId: string, sessionId: string) =>
      (conversationIngestionPipeline as unknown as {
        ensureConversationSession: (u: string, s: string) => Promise<string>;
      }).ensureConversationSession(userId, sessionId);

    it('returns the id directly when sessionId is already a conversation session', async () => {
      // direct-id lookup is the only unordered select → returns the row
      setRoute('conversation_sessions', ({ terminal, ordered }) =>
        terminal === 'then' && !ordered
          ? { data: [{ id: 'conv-1' }], error: null }
          : { data: [], error: null },
      );
      await expect(call('user-1', 'conv-1')).resolves.toBe('conv-1');
    });

    it('reuses an existing chat→conversation mapping', async () => {
      // direct-id lookup (unordered) misses; mapping lookup (ordered) hits
      setRoute('conversation_sessions', ({ terminal, ordered }) => {
        if (terminal === 'then') {
          return ordered
            ? { data: [{ id: 'mapped-conv' }], error: null }
            : { data: [], error: null };
        }
        return { data: null, error: null };
      });
      await expect(call('user-1', 'chat-sess')).resolves.toBe('mapped-conv');
    });

    it('creates a new conversation session when no mapping exists', async () => {
      setRoute('conversation_sessions', ({ terminal }) => {
        if (terminal === 'then') return { data: [], error: null }; // both lookups miss
        if (terminal === 'single') return { data: { id: 'new-conv' }, error: null }; // insert
        return { data: null, error: null };
      });
      setRoute('chat_sessions', () => ({ data: { metadata: { title: 'T' } }, error: null }));
      await expect(call('user-1', 'chat-sess')).resolves.toBe('new-conv');
    });

    it('throws when the insert fails', async () => {
      setRoute('conversation_sessions', ({ terminal }) => {
        if (terminal === 'then') return { data: [], error: null };
        if (terminal === 'single') return { data: null, error: { message: 'insert failed' } };
        return { data: null, error: null };
      });
      setRoute('chat_sessions', () => ({ data: null, error: null }));
      await expect(call('user-1', 'chat-sess')).rejects.toBeTruthy();
    });
  });
});

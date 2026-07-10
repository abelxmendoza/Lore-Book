import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

describe('threadContentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadThreadMessages falls back to chat_messages when metadata and conversation_messages are empty', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions' ? { metadata: {} } : null,
      });
      if (table === 'conversation_messages') {
        builder.then = undefined;
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-1',
                    role: 'user',
                    content: 'I met Alex Morgan today',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Alex');
  });

  it('prefers chat_messages over legacy metadata snapshot when both exist', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions'
          ? {
              metadata: {
                messages: [
                  {
                    id: 'user-local-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    timestamp: '2026-06-01T00:00:00Z',
                  },
                ],
              },
            }
          : null,
      });
      if (table === 'conversation_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-user-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                  {
                    id: 'cm-assistant-1',
                    role: 'assistant',
                    content: 'Jerry is tied to early LifeLedger development.',
                    created_at: '2026-06-01T00:00:01Z',
                    metadata: null,
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].id).toBe('cm-assistant-1');
  });

  it('merges assistant from metadata when chat_messages is user-only', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions'
          ? {
              metadata: {
                messages: [
                  {
                    id: 'meta-a1',
                    role: 'assistant',
                    content: 'Jerry worked on LifeLedger early on.',
                    timestamp: '2026-06-01T00:00:01Z',
                  },
                ],
              },
            }
          : null,
      });
      if (table === 'conversation_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-user-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toContain('LifeLedger');
  });

  it('filters empty assistant placeholders from merged results', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions' ? { metadata: {} } : null,
      });
      if (table === 'conversation_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-user-1',
                    role: 'user',
                    content: 'hello',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                  {
                    id: 'cm-empty-asst',
                    role: 'assistant',
                    content: '   ',
                    created_at: '2026-06-01T00:00:01Z',
                    metadata: { stream_status: 'streaming' },
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('falls back to legacy metadata when chat_messages is empty', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions'
          ? {
              metadata: {
                messages: [
                  {
                    id: 'user-local-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    timestamp: '2026-06-01T00:00:00Z',
                  },
                ],
              },
            }
          : null,
      });
      if (table === 'conversation_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Jerry');
  });

  describe('assignMessageRefs', () => {
    const row = (
      id: string,
      role: 'user' | 'assistant',
      overrides: Partial<import('./threadContentService').ThreadMessageRow> = {}
    ) => ({
      id,
      role,
      content: `${role} ${id}`,
      created_at: '2026-06-01T00:00:00Z',
      ...overrides,
    });

    it('derives turn/reply numbering for legacy rows without stored refs', async () => {
      const { assignMessageRefs } = await import('./threadContentService');
      const out = assignMessageRefs([
        row('1', 'user'),
        row('2', 'assistant'),
        row('3', 'user'),
        row('4', 'assistant'),
        row('5', 'assistant'),
      ]);
      expect(out.map((m) => [m.turn_number, m.reply_seq])).toEqual([
        [1, 0],
        [1, 1],
        [2, 0],
        [2, 1],
        [2, 2],
      ]);
    });

    it('keeps stored trigger-assigned refs untouched', async () => {
      const { assignMessageRefs } = await import('./threadContentService');
      const out = assignMessageRefs([
        row('1', 'user', { turn_number: 7, reply_seq: 0 }),
        row('2', 'assistant', { turn_number: 7, reply_seq: 1 }),
        row('3', 'user'),
      ]);
      expect(out.map((m) => [m.turn_number, m.reply_seq])).toEqual([
        [7, 0],
        [7, 1],
        [8, 0],
      ]);
    });

    it('anchors an assistant-first thread to turn 1', async () => {
      const { assignMessageRefs } = await import('./threadContentService');
      const out = assignMessageRefs([row('1', 'assistant'), row('2', 'user')]);
      expect(out.map((m) => [m.turn_number, m.reply_seq])).toEqual([
        [1, 1],
        [2, 0],
      ]);
    });
  });
});

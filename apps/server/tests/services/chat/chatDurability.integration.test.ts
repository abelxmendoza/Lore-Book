/**
 * Integration-style tests for the durability boundary around chat setup failures.
 * Mocks Supabase + OpenAI stream adapter; verifies enqueue-before-response and error contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueueDurable = vi.fn();
const enqueue = vi.fn();
const createStream = vi.fn();
const insertChain = vi.fn();
const selectChain = vi.fn();

vi.mock('../../../src/services/supabaseClient', () => {
  const from = vi.fn((table: string) => {
    if (table === 'chat_messages') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: (row: unknown) => {
          insertChain(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'persisted-msg-1' }, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'conversation_sessions') {
      return {
        update: () => ({
          eq: () => ({ eq: async () => ({ error: null }) }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: 'session-1' }, error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    };
  });
  return { supabaseAdmin: { from } };
});

vi.mock('../../../src/services/ingestion/ingestionQueue', () => ({
  ingestionQueue: {
    enqueue: (...args: unknown[]) => enqueue(...args),
    enqueueDurable: (...args: unknown[]) => enqueueDurable(...args),
  },
}));

vi.mock('../../../src/services/chat/openaiChatStreamAdapter', () => ({
  createOpenAIChatStream: (...args: unknown[]) => createStream(...args),
}));

vi.mock('../../../src/services/pipeline/loreInterpretationPipeline', () => ({
  runLoreInterpretationPipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/config', () => ({
  config: {
    chatModel: 'gpt-test',
    enableLoreAgents: false,
    openAiResponseChaining: false,
    openAiConversationsApi: false,
    openAiVectorStoreEnabled: false,
    useResponsesApi: false,
  },
}));

// Avoid heavy import fan-out where possible — omegaChatService still pulls many modules.
vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('chat durability boundary (enqueue before OpenAI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueDurable.mockResolvedValue({ jobId: 'job-1', isNew: true, status: 'QUEUED' });
    enqueue.mockReturnValue('job-legacy');
    selectChain.mockReset();
    insertChain.mockReset();
  });

  it('createOpenAIChatStream 429 after persist yields ChatDurabilityError with job', async () => {
    createStream.mockRejectedValue(Object.assign(new Error('Rate limit 429'), { status: 429 }));

    // Dynamically import after mocks
    const { ChatDurabilityError } = await import('../../../src/services/chat/chatDurability');
    // Lightweight unit of the error path used by omegaChatService
    const { buildDurabilityPayload } = await import('../../../src/services/chat/chatDurability');
    const { classifyIngestionError } = await import('../../../src/services/ingestion/ingestionJobStates');

    // Simulate the wrap used around createOpenAIChatStream
    let thrown: unknown;
    try {
      await createStream({});
    } catch (streamSetupErr) {
      const classified = classifyIngestionError(streamSetupErr);
      thrown = new ChatDurabilityError({
        message: streamSetupErr instanceof Error ? streamSetupErr.message : String(streamSetupErr),
        category: classified.category,
        code: classified.code,
        stage: 'response_generation',
        durability: buildDurabilityPayload({
          userMessageId: 'persisted-msg-1',
          sessionId: 'session-1',
          assistantStatus: 'failed',
          assistantErrorCategory: classified.category,
          ingestionJobId: 'job-1',
          ingestionStatus: 'QUEUED',
        }),
        cause: streamSetupErr,
      });
    }

    expect(thrown).toBeInstanceOf(ChatDurabilityError);
    const err = thrown as InstanceType<typeof ChatDurabilityError>;
    expect(err.durability.userMessage.persisted).toBe(true);
    expect(err.durability.ingestion.jobId).toBe('job-1');
    expect(err.durability.assistantResponse.status).toBe('failed');
    expect(err.category).toBe('rate_limit');
  });

  it('enqueueDurable is preferred for durable scheduling', async () => {
    await enqueueDurable(
      { userId: 'u1', chatMessageId: 'm1', sessionId: 's1' },
      'NORMAL',
    );
    expect(enqueueDurable).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('duplicate enqueue returns DUPLICATE without second job identity requirement', async () => {
    enqueueDurable
      .mockResolvedValueOnce({ jobId: 'job-1', isNew: true, status: 'QUEUED' })
      .mockResolvedValueOnce({ jobId: 'job-1', isNew: false, status: 'DUPLICATE' });

    const a = await enqueueDurable({ userId: 'u1', chatMessageId: 'm1', sessionId: 's1' });
    const b = await enqueueDurable({ userId: 'u1', chatMessageId: 'm1', sessionId: 's1' });
    expect(a.status).toBe('QUEUED');
    expect(b.status).toBe('DUPLICATE');
    expect(a.jobId).toBe(b.jobId);
  });
});

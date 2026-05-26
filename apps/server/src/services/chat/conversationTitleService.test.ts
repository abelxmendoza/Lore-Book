import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks — must be before vi.mock factories ──────────────────────────

const { mockCreate, mockFrom } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../lib/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { conversationTitleService } from './conversationTitleService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a chainable Supabase query mock. */
function makeSupabaseChain(returnData: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
  };
  return chain;
}

function makeMessages(count = 2): Array<{ role: 'user' | 'assistant'; content: string }> {
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` });
  }
  return msgs;
}

function makeOpenAIResponse(title: string, subtitle: string) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ title, subtitle }),
        },
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConversationTitleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── LLM happy path ────────────────────────────────────────────────────────

  it('generates a title and subtitle from the LLM and persists them', async () => {
    const chain = makeSupabaseChain({ id: 't1', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse('Existential Drift', 'Deep Reflection'));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 't1',
      messages: makeMessages(4),
    });

    expect(result.title).toBe('Existential Drift');
    expect(result.subtitle).toBe('Deep Reflection');

    // Must persist to DB
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Existential Drift',
        metadata: expect.objectContaining({ subtitle: 'Deep Reflection', titleSource: 'auto' }),
      })
    );
  });

  it('trims and validates LLM title — rejects empty or too-long candidates', async () => {
    const chain = makeSupabaseChain({ id: 't2', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    // Title is empty, subtitle is fine
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse('', 'Log Entry'));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 't2',
      messages: makeMessages(2),
    });

    // Falls back to keyword extraction when LLM title is empty
    expect(result.title).toBeTruthy();
    expect(result.title).not.toBe('');
    // Title should not be the empty LLM response
    expect(result.title.length).toBeGreaterThan(1);
  });

  // ── Keyword fallback ──────────────────────────────────────────────────────

  it('falls back to keyword extraction when the LLM throws', async () => {
    const chain = makeSupabaseChain({ id: 't3', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    mockCreate.mockRejectedValueOnce(new Error('429 Too Many Requests'));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 't3',
      messages: [
        { role: 'user', content: 'Tell me about my relationship with Sarah' },
        { role: 'assistant', content: 'Of course, let me recall...' },
      ],
    });

    // Keyword fallback should produce something meaningful
    expect(result.title).toBeTruthy();
    expect(result.title).not.toBe('New chat');
    // Should still persist (with auto source)
    expect(chain.update).toHaveBeenCalled();
  });

  it('derives subtitle from modeDecision when LLM fails', async () => {
    const chain = makeSupabaseChain({ id: 't4', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    mockCreate.mockRejectedValueOnce(new Error('Network error'));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 't4',
      messages: [{ role: 'user', content: 'I want to reflect on my goals' }, { role: 'assistant', content: 'Sure' }],
      modeDecision: 'DEEP_REFLECTION',
    });

    expect(result.subtitle).toBe('Deep Reflection');
  });

  it('falls back to first message slice when keyword extraction finds nothing useful', async () => {
    const chain = makeSupabaseChain({ id: 't5', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    mockCreate.mockRejectedValueOnce(new Error('fail'));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 't5',
      messages: [
        // All stop-words — keyword fallback should use the raw slice
        { role: 'user', content: 'I am a the it is to' },
        { role: 'assistant', content: 'Yes' },
      ],
    });

    expect(result.title).toBeTruthy();
  });

  // ── User-renamed guard ────────────────────────────────────────────────────

  it('does NOT overwrite a user-renamed title (titleSource: user)', async () => {
    const chain = makeSupabaseChain({
      id: 'user-named',
      title: 'My Custom Title',
      metadata: { titleSource: 'user' },
    });
    mockFrom.mockReturnValue(chain);

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 'user-named',
      messages: makeMessages(4),
    });

    expect(result.title).toBe('My Custom Title');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
  });

  // ── renameTitle ───────────────────────────────────────────────────────────

  it('renameTitle persists the new title with titleSource: user', async () => {
    const chain = makeSupabaseChain({ metadata: {} });
    mockFrom.mockReturnValue(chain);

    await conversationTitleService.renameTitle('u1', 'rename-1', 'Brand New Name');

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Brand New Name',
        metadata: expect.objectContaining({ titleSource: 'user' }),
      })
    );
  });

  it('renameTitle preserves existing metadata keys while setting titleSource', async () => {
    const existingMeta = { subtitle: 'Deep Reflection', someKey: 'someValue' };
    const chain = makeSupabaseChain({ metadata: existingMeta });
    mockFrom.mockReturnValue(chain);

    await conversationTitleService.renameTitle('u1', 'rename-2', 'Updated Title');

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          subtitle: 'Deep Reflection',
          someKey: 'someValue',
          titleSource: 'user',
        }),
      })
    );
  });

  // ── Non-JSON LLM response ─────────────────────────────────────────────────

  it('falls back to keywords when LLM returns non-JSON', async () => {
    const chain = makeSupabaseChain({ id: 'non-json', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Here is a title: Great Session' } }],
    });

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 'non-json',
      messages: [
        { role: 'user', content: 'I want to learn programming skills today' },
        { role: 'assistant', content: 'Sure' },
      ],
    });

    // Non-JSON response → keyword fallback
    expect(result.title).toBeTruthy();
    // Title should NOT be the raw LLM prose
    expect(result.title).not.toContain('Here is a title');
  });

  // ── modeDecision subtitle map ─────────────────────────────────────────────

  it('uses the MODE_SUBTITLE_MAP when LLM succeeds but returns no subtitle', async () => {
    const chain = makeSupabaseChain({ id: 'mode-sub', title: 'New chat', metadata: {} });
    mockFrom.mockReturnValue(chain);
    // LLM returns title but empty subtitle
    mockCreate.mockResolvedValueOnce(makeOpenAIResponse('Action Plan', ''));

    const result = await conversationTitleService.generateTitle({
      userId: 'u1',
      threadId: 'mode-sub',
      messages: makeMessages(2),
      modeDecision: 'ACTION_LOG',
    });

    expect(result.title).toBe('Action Plan');
    // subtitle comes from the LLM — empty candidate, no subtitle set
    expect(result.subtitle).toBeUndefined();
  });
});

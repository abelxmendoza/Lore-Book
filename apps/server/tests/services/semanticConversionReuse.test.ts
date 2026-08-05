import { describe, it, expect, vi, beforeEach } from 'vitest';

const { extractPerceptionsFromChat, createPerceptionsFromExtraction } = vi.hoisted(() => ({
  extractPerceptionsFromChat: vi.fn(),
  createPerceptionsFromExtraction: vi.fn(),
}));

vi.mock('../../src/services/perceptionChatService', () => ({
  perceptionChatService: { extractPerceptionsFromChat, createPerceptionsFromExtraction },
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { saveEntry: vi.fn() },
}));
vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {},
}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));
vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { semanticConversionService } from '../../src/services/conversationCentered/semanticConversion';

const baseUnit = {
  id: 'u1',
  type: 'PERCEPTION' as const,
  content: 'I sense distance from Maria lately.',
  utterance_id: 'utt1',
  metadata: {},
};

const baseCtx = {
  userId: 'user-1',
  messageId: 'msg-1',
  sessionId: 'thread-1',
  utteranceId: 'utt1',
  conversationHistory: [{ role: 'user' as const, content: 'earlier message' }],
};

function onePerception(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    subject_alias: 'Maria',
    content: 'I sense distance from Maria lately.',
    source: 'intuition' as const,
    confidence_level: 0.4,
    sentiment: 'neutral' as const,
    impact_on_me: 'Makes me anxious about the friendship.',
    ...overrides,
  };
}

describe('semanticConversion perception → perceptionChatService delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPerceptionsFromExtraction.mockResolvedValue([{ id: 'perc-1', subject_alias: 'Maria' }]);
  });

  it('delegates extraction to perceptionChatService with the unit content and conversation history', async () => {
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [onePerception()],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });

    const result = await semanticConversionService.convertUnitsToMemoryArtifacts(
      [baseUnit as any],
      { ...baseCtx } as any
    );

    expect(extractPerceptionsFromChat).toHaveBeenCalledWith(
      'user-1',
      baseUnit.content,
      baseCtx.conversationHistory
    );
    expect(result.perceptionEntries).toEqual(['perc-1']);
  });

  it('passes source linkage metadata through to createPerceptionsFromExtraction', async () => {
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [onePerception()],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });

    await semanticConversionService.convertUnitsToMemoryArtifacts([baseUnit as any], { ...baseCtx } as any);

    expect(createPerceptionsFromExtraction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ perceptions: [expect.objectContaining({ subject_alias: 'Maria' })] }),
      {
        source_message_id: 'msg-1',
        utterance_id: 'utt1',
        session_id: 'thread-1',
        extracted_unit_id: 'u1',
      }
    );
  });

  it('fills subject_person_id from message-level resolvedEntities when perceptionChatService did not resolve one', async () => {
    const perception = onePerception();
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [perception],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });

    await semanticConversionService.convertUnitsToMemoryArtifacts([baseUnit as any], {
      ...baseCtx,
      resolvedEntities: [{ id: 'p1', type: 'PERSON', name: 'Maria' }],
    } as any);

    // Mutated in place before being handed to createPerceptionsFromExtraction.
    expect(perception.subject_person_id).toBe('p1');
  });

  it('leaves subject_person_id alone when perceptionChatService already resolved it', async () => {
    const perception = onePerception({ subject_person_id: 'already-resolved' });
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [perception],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });

    await semanticConversionService.convertUnitsToMemoryArtifacts([baseUnit as any], {
      ...baseCtx,
      resolvedEntities: [{ id: 'p1', type: 'PERSON', name: 'Maria' }],
    } as any);

    expect(perception.subject_person_id).toBe('already-resolved');
  });

  it('returns no entries and does not call createPerceptionsFromExtraction when nothing perception-shaped was found', async () => {
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });

    const result = await semanticConversionService.convertUnitsToMemoryArtifacts(
      [baseUnit as any],
      { ...baseCtx } as any
    );

    expect(createPerceptionsFromExtraction).not.toHaveBeenCalled();
    expect(result.perceptionEntries).toEqual([]);
  });

  it('captures every perception found in a single unit, not just the first', async () => {
    extractPerceptionsFromChat.mockResolvedValue({
      perceptions: [onePerception(), onePerception({ subject_alias: 'Jake' })],
      charactersCreated: [],
      charactersLinked: [],
      needsFraming: false,
    });
    createPerceptionsFromExtraction.mockResolvedValue([
      { id: 'perc-1', subject_alias: 'Maria' },
      { id: 'perc-2', subject_alias: 'Jake' },
    ]);

    const result = await semanticConversionService.convertUnitsToMemoryArtifacts(
      [baseUnit as any],
      { ...baseCtx } as any
    );

    expect(result.perceptionEntries).toEqual(['perc-1', 'perc-2']);
  });

  it('does not throw when perceptionChatService rejects — conversion is non-blocking', async () => {
    extractPerceptionsFromChat.mockRejectedValue(new Error('LLM unavailable'));

    const result = await semanticConversionService.convertUnitsToMemoryArtifacts(
      [baseUnit as any],
      { ...baseCtx } as any
    );

    expect(result.perceptionEntries).toEqual([]);
  });
});

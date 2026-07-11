import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'char-1',
          name: 'Daisy',
          alias: ['Moth Queen'],
          summary: 'DJ friend',
          role: 'friend',
          pronouns: 'she/her',
          metadata: {},
        },
      }),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../../../src/services/entityFactsService', () => ({
  entityFactsService: {
    extractAndPersistFacts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/conversationCentered/entityConversationLinkService', () => ({
  entityConversationLinkService: {
    linkEntity: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/memory/memoryEventService', () => ({
  appendMemoryEvent: vi.fn().mockResolvedValue(undefined),
}));

import { applyCharacterChatKnowledgeUpdate } from '../../../src/services/characters/characterChatCorrectionService';
import { entityFactsService } from '../../../src/services/entityFactsService';
import { supabaseAdmin } from '../../../src/services/supabaseClient';

describe('applyCharacterChatKnowledgeUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates name on correction phrasing', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'char-1',
          name: 'Moth Queen',
          alias: [],
          summary: null,
          role: null,
          pronouns: null,
          metadata: {},
        },
      }),
      update,
    } as never);

    const result = await applyCharacterChatKnowledgeUpdate(
      'user-1',
      'char-1',
      'Actually her name is Daisy',
      { sessionId: 'sess-1', messageId: 'msg-1' },
    );

    expect(result.isCorrection).toBe(true);
    expect(result.fieldUpdates).toContain('name');
    expect(update).toHaveBeenCalled();
    expect(entityFactsService.extractAndPersistFacts).toHaveBeenCalled();
  });

  it('still extracts facts when chip is attached without explicit correction wording', async () => {
    const result = await applyCharacterChatKnowledgeUpdate(
      'user-1',
      'char-1',
      'She works at the coffee shop on Main Street.',
      { sessionId: 'sess-1' },
    );

    expect(result.isCorrection).toBe(false);
    expect(result.factsExtracted).toBe(true);
    expect(entityFactsService.extractAndPersistFacts).toHaveBeenCalledWith(
      'user-1',
      'char-1',
      'character',
      expect.any(String),
      expect.stringContaining('She works at the coffee shop'),
    );
  });
});

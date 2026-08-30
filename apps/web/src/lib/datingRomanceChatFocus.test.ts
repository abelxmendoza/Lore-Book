import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

import { openChatWithFocus } from './openChatWithFocus';
import {
  DATING_ROMANCE_KNOWLEDGE_SCOPE,
  openDatingRomanceCharacterChat,
} from './datingRomanceChatFocus';

describe('datingRomanceChatFocus', () => {
  beforeEach(() => {
    vi.mocked(openChatWithFocus).mockClear();
  });

  it('opens chat with Dating & Romance focus for a book character, with an empty composer', () => {
    openDatingRomanceCharacterChat({
      entityId: 'char-jamie',
      entityName: 'Jamie',
      relationshipId: 'rel-1',
      baseline: { affectionScore: 40, healthScore: 50 },
    });

    expect(openChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'char-jamie',
        entityName: 'Jamie',
        entityType: 'character',
        relationshipId: 'rel-1',
        sourceSurface: 'love',
        sourceLabel: 'Dating & Romance',
        knowledgeScope: DATING_ROMANCE_KNOWLEDGE_SCOPE,
        baseline: { affectionScore: 40, healthScore: 50 },
      }),
    );
    const call = vi.mocked(openChatWithFocus).mock.calls[0][0];
    expect(call.initialPrompt).toBeUndefined();
    expect(call.autoSubmit).toBeUndefined();
  });

  it('keeps a caller-supplied prompt', () => {
    openDatingRomanceCharacterChat({
      entityId: 'char-alex',
      entityName: 'Alex',
      initialPrompt: 'What do I actually feel about Alex?',
    });

    expect(openChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSurface: 'love',
        initialPrompt: 'What do I actually feel about Alex?',
      }),
    );
  });
});

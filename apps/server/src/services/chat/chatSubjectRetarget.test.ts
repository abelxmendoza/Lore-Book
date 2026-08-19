import { describe, expect, it } from 'vitest';

import { resolveChatSubjectRetarget } from './chatSubjectRetarget';

const MARCUS = { id: 'char-marcus', name: 'Marcus', type: 'character' as const };
const JAMIE = { id: 'char-jamie', name: 'Jamie', type: 'character' as const };

describe('resolveChatSubjectRetarget', () => {
  it('drops a leftover pin when a capture prompt names someone else', () => {
    const result = resolveChatSubjectRetarget({
      message:
        'I want to talk about Marcus. Help me capture who they are, how we know each other, and what matters about them right now. Please do not invent details I have not shared.',
      chatFocus: { entityId: JAMIE.id, entityName: JAMIE.name, entityType: 'character' },
      threadEntities: [MARCUS],
    });

    expect(result.dropStaleFocus).toBe(true);
    expect(result.subjectName).toBe('Marcus');
    expect(result.entityContext).toEqual({ type: 'CHARACTER', id: MARCUS.id });
    expect(result.chatFocusPatch?.entityId).toBe(MARCUS.id);
  });

  it('resolves who-is-he to the person named in the capture prompt, not the leftover pin', () => {
    const result = resolveChatSubjectRetarget({
      message: 'who is he',
      chatFocus: { entityId: JAMIE.id, entityName: JAMIE.name, entityType: 'character' },
      threadEntities: [MARCUS, JAMIE],
      conversationHistory: [
        {
          role: 'user',
          content: 'I want to talk about Marcus. Help me capture who they are.',
        },
      ],
    });

    expect(result.dropStaleFocus).toBe(true);
    expect(result.entityContext?.id).toBe(MARCUS.id);
    expect(result.subjectName).toBe('Marcus');
  });

  it('keeps a matching pin', () => {
    const result = resolveChatSubjectRetarget({
      message: 'I want to talk about Marcus. Help me capture who they are.',
      chatFocus: { entityId: MARCUS.id, entityName: MARCUS.name, entityType: 'character' },
      threadEntities: [MARCUS],
    });

    expect(result.dropStaleFocus).toBe(false);
    expect(result.entityContext?.id).toBe(MARCUS.id);
  });
});

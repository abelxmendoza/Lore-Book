import { describe, it, expect } from 'vitest';

import { getDemoFocusResponse } from './demoFocusChat';
import type { ChatFocus } from '../types/chatFocus';
import { emptyChatFocusSessionStats } from '../types/chatFocus';

describe('demoFocusChat', () => {
  const loveFocus: ChatFocus = {
    entityId: 'char-alex',
    entityName: 'Alex',
    entityType: 'character',
    sourceSurface: 'love',
    sourceLabel: 'Love & Relationships',
    relationshipId: 'rel-001',
    knowledgeScope: 'romantic relationship',
    sessionStats: emptyChatFocusSessionStats(),
    baseline: { affectionScore: 92, healthScore: 78 },
  };

  it('returns love-focused demo copy with connection deepening', () => {
    const text = getDemoFocusResponse('How are things going with Alex?', loveFocus);
    expect(text).toContain('Alex');
    expect(text).toContain('Love & Relationships');
    expect(text).toContain('Connection deepening');
    expect(text).toContain('Demo');
  });

  it('returns character-section copy for non-love focus', () => {
    const focus: ChatFocus = {
      ...loveFocus,
      sourceSurface: 'characters',
      sourceLabel: 'Characters',
      relationshipId: undefined,
    };
    const text = getDemoFocusResponse('Tell me about Alex', focus);
    expect(text).toContain('Characters');
    expect(text).toContain('Alex');
  });
});

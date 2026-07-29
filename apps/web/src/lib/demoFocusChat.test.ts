import { describe, it, expect } from 'vitest';

import { DEMO_FOCUS_CAPABILITY_DISCLAIMER, getDemoFocusResponse } from './demoFocusChat';
import type { ChatFocus } from '../types/chatFocus';
import { emptyChatFocusSessionStats } from '../types/chatFocus';

describe('demoFocusChat', () => {
  const loveFocus: ChatFocus = {
    entityId: 'char-alex',
    entityName: 'Alex',
    entityType: 'character',
    sourceSurface: 'love',
    sourceLabel: 'Dating & Romance',
    relationshipId: 'rel-001',
    knowledgeScope: 'romantic relationship',
    sessionStats: emptyChatFocusSessionStats(),
    baseline: { affectionScore: 92, healthScore: 78 },
  };

  it('returns love-focused demo copy with connection deepening and capability disclaimer', () => {
    const text = getDemoFocusResponse('How are things going with Alex?', loveFocus);
    expect(text).toContain('Alex');
    expect(text).toContain('Dating & Romance');
    expect(text).toContain('Connection deepening');
    expect(text).toContain('Demo');
    expect(text).toContain(DEMO_FOCUS_CAPABILITY_DISCLAIMER);
    expect(text).toMatch(/does \*\*not\*\* call the OpenAI API/i);
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
    expect(text).toContain('Demo disclaimer');
  });

  it('disclaims limited capability for Omni Timeline focus handoffs', () => {
    const focus: ChatFocus = {
      ...loveFocus,
      entityName: 'Street Photography',
      entityType: 'memory',
      sourceSurface: 'timeline',
      sourceLabel: 'Omni Timeline',
      relationshipId: undefined,
      baseline: undefined,
    };
    const text = getDemoFocusResponse(
      "I'm focusing on my stitched timeline “Street Photography”.",
      focus,
    );
    expect(text).toContain('Omni Timeline focus');
    expect(text).toContain('Street Photography');
    expect(text).toMatch(/does \*\*not\*\* call the OpenAI API/i);
    expect(text).toMatch(/isn’t at full capability/i);
  });
});

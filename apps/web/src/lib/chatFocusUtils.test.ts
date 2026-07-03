import { describe, it, expect } from 'vitest';

import { focusToEntityContext } from './chatFocusUtils';
import type { ChatFocus } from '../types/chatFocus';
import { emptyChatFocusSessionStats } from '../types/chatFocus';

describe('chatFocusUtils', () => {
  it('maps romantic relationship focus to ROMANTIC_RELATIONSHIP entity context', () => {
    const focus: ChatFocus = {
      entityId: 'char-1',
      entityName: 'Alex',
      entityType: 'character',
      sourceSurface: 'love',
      sourceLabel: 'Dating & Romance',
      relationshipId: 'rel-001',
      sessionStats: emptyChatFocusSessionStats(),
    };
    expect(focusToEntityContext(focus)).toEqual({
      type: 'ROMANTIC_RELATIONSHIP',
      id: 'rel-001',
    });
  });

  it('maps character focus without relationship id to CHARACTER', () => {
    const focus: ChatFocus = {
      entityId: 'char-2',
      entityName: 'Jordan',
      entityType: 'character',
      sourceSurface: 'characters',
      sourceLabel: 'Characters',
      sessionStats: emptyChatFocusSessionStats(),
    };
    expect(focusToEntityContext(focus)).toEqual({
      type: 'CHARACTER',
      id: 'char-2',
    });
  });
});

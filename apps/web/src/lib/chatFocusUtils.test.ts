import { describe, it, expect } from 'vitest';

import { emptyChatFocusSessionStats, type ChatFocus } from '../types/chatFocus';
import { focusToComposerEntities, focusToEntityContext } from './chatFocusUtils';

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

  it('keeps a Timeline moment typed as an event and out of generic entity context', () => {
    const focus: ChatFocus = {
      entityId: 'event-1',
      entityName: 'Catch-up coffee after the gap',
      entityType: 'event',
      sourceSurface: 'events',
      sourceLabel: 'Timeline',
      sessionStats: emptyChatFocusSessionStats(),
    };

    expect(focusToEntityContext(focus)).toBeUndefined();
    expect(focusToComposerEntities(focus)).toEqual([
      expect.objectContaining({
        id: 'event-1',
        name: 'Catch-up coffee after the gap',
        type: 'event',
        status: 'confirmed',
      }),
    ]);
  });
});

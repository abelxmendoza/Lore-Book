import { describe, expect, it } from 'vitest';

import { emptyChatFocusSessionStats, type ChatFocus } from '../types/chatFocus';

import { focusToComposerEntities, focusToEntityContext } from './chatFocusUtils';

const perceptionFocus: ChatFocus = {
  entityId: 'perception-1',
  entityName: 'Perception about Jamie',
  entityType: 'perception',
  sourceSurface: 'perceptions',
  sourceLabel: 'Perception Book',
  sessionStats: emptyChatFocusSessionStats(),
};

describe('perception chat focus', () => {
  it('does not turn a perception into a canonical character or entity', () => {
    expect(focusToEntityContext(perceptionFocus)).toBeUndefined();
    expect(focusToComposerEntities(perceptionFocus)).toEqual([]);
  });
});

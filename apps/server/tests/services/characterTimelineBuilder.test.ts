import { describe, it, expect } from 'vitest';
import { characterTimelineBuilder } from '../../src/services/conversationCentered/characterTimelineBuilder';

describe('CharacterTimelineBuilder', () => {
  it('exposes only canonical buildTimelines', () => {
    expect(typeof characterTimelineBuilder.buildTimelines).toBe('function');
    expect(characterTimelineBuilder).not.toHaveProperty('processEventForCharacters');
    expect(characterTimelineBuilder).not.toHaveProperty('processEpisodeForCharacter');
    expect(characterTimelineBuilder).not.toHaveProperty('rebuildTimelinesForCharacter');
    expect(characterTimelineBuilder).not.toHaveProperty('addEventToTimeline');
  });
});

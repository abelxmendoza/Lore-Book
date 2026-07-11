import { describe, it, expect } from 'vitest';
import { rankSessionDelta } from './sessionDelta';

describe('rankSessionDelta', () => {
  it('returns empty when nothing changed', () => {
    const r = rankSessionDelta({
      gapDays: 3,
      newMemoryCount: 0,
      newCharacters: [],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
      strongestTheme: 'Growth',
    });
    expect(r.hasChanges).toBe(false);
    expect(r.lines).toEqual([]);
    expect(r.headline).toBeNull();
  });

  it('prefers completed goals over raw memory counts', () => {
    const r = rankSessionDelta({
      gapDays: 2,
      newMemoryCount: 5,
      newCharacters: [],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
      completedGoals: ['Rocket Lab interview prep'],
    });
    expect(r.headline).toMatch(/finished/i);
    expect(r.lines[0]).toMatch(/Rocket Lab/i);
    expect(r.lines.length).toBeLessThanOrEqual(3);
  });

  it('surfaces new people with names', () => {
    const r = rankSessionDelta({
      gapDays: 1,
      newMemoryCount: 0,
      newCharacters: [
        { id: '1', name: 'Khalil' },
        { id: '2', name: 'Priya' },
      ],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
    });
    expect(r.hasChanges).toBe(true);
    expect(r.lines.some((l) => /Khalil/.test(l) && /Priya/.test(l))).toBe(true);
  });

  it('does not use theme alone as a delta', () => {
    const r = rankSessionDelta({
      gapDays: 5,
      newMemoryCount: 0,
      newCharacters: [],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
      strongestTheme: 'Ambition',
    });
    expect(r.hasChanges).toBe(false);
  });

  it('caps at 3 lines', () => {
    const r = rankSessionDelta({
      gapDays: 4,
      newMemoryCount: 10,
      newChatMessageCount: 4,
      newCharacters: [{ id: '1', name: 'Alex' }],
      newTimelineEventCount: 3,
      reinforcedEntities: [
        { name: 'Jordan', newMentionCount: 4 },
        { name: 'Sam', newMentionCount: 2 },
      ],
      completedGoals: ['BJJ belt test'],
      abandonedGoals: ['Tesla application'],
      newMeaningLabels: ['Respect boundaries'],
    });
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.hasChanges).toBe(true);
  });

  it('mentions abandoned goals as moved on', () => {
    const r = rankSessionDelta({
      gapDays: 2,
      newMemoryCount: 0,
      newCharacters: [],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
      abandonedGoals: ['Apply to Tesla'],
    });
    expect(r.headline).toMatch(/moved on/i);
    expect(r.headline).toMatch(/Tesla/i);
  });

  it('treats chat messages as memory signal when journal empty', () => {
    const r = rankSessionDelta({
      gapDays: 2,
      newMemoryCount: 0,
      newChatMessageCount: 6,
      newCharacters: [],
      newTimelineEventCount: 0,
      reinforcedEntities: [],
    });
    expect(r.hasChanges).toBe(true);
    expect(r.lines[0]).toMatch(/6 new memories/i);
  });
});

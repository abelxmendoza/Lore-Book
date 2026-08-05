import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openGeneratedTimelineChat } from './generatedTimelineChat';

describe('openGeneratedTimelineChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens real compiled subject context in a fresh main chat', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    openGeneratedTimelineChat({
      query: 'Everything with Marcus',
      isMock: false,
      events: [{
        id: 'event-1',
        start_time: '2025-04-01T00:00:00.000Z',
        title: 'Made the project official',
        content: 'We agreed on the first milestone.',
        timeline_names: ['Projects'],
      }],
      compilation: {
        intent: {
          rawQuery: 'Everything with Marcus',
          mode: 'SUBJECT_TIMELINE',
          subjectQuery: 'Marcus',
          perspective: 'ALL_RELEVANT',
          expectedPhases: ['beginning'],
        },
        subject: {
          entityId: 'person-1',
          entityType: 'person',
          displayName: 'Marcus',
          aliases: [],
          confidence: 1,
        },
        ambiguity: [],
        period: null,
        coverage: {
          score: 0.5,
          coveredPhases: ['beginning'],
          missingPhases: [],
          isComplete: false,
        },
        sources: ['resolved_event'],
        warnings: [],
        contextEvents: [],
      },
    });

    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('lorebook:open-chat-focus');
    expect(event.detail).toMatchObject({
      entityId: 'person-1',
      entityName: 'Marcus',
      entityType: 'character',
      sourceSurface: 'timeline',
      autoSubmit: true,
      startNewThread: true,
    });
    expect(event.detail.knowledgeScope).toContain('2025-04-01: Made the project official');
  });

  it('never sends simulated moments as evidence', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    openGeneratedTimelineChat({
      query: 'Everything with Alex',
      isMock: true,
      events: [{
        id: 'mock-gen-1',
        start_time: '2024-08-09T00:00:00.000Z',
        content: 'A fabricated preview moment.',
        timeline_names: ['Love'],
        stateChange: 'Turning point',
      }],
    });

    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.detail.knowledgeScope).toContain('simulated preview only');
    expect(event.detail.knowledgeScope).not.toContain('fabricated preview moment');
    expect(event.detail.initialPrompt).toContain('what actually happened');
  });
});

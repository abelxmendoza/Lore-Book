import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compileSubjectTimelineForUser: vi.fn(),
  capturePreferredStageNameCorrection: vi.fn(),
}));

vi.mock('../../src/services/timeline/subjectTimelineCompiler', () => ({
  compileSubjectTimelineForUser: mocks.compileSubjectTimelineForUser,
}));
vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: { capturePreferredStageNameCorrection: mocks.capturePreferredStageNameCorrection },
}));

import { buildSubjectTimelineChatResponse } from '../../src/services/chat/subjectTimelineChatService';

describe('subject timeline chat adapter', () => {
  beforeEach(() => {
    mocks.compileSubjectTimelineForUser.mockReset();
    mocks.capturePreferredStageNameCorrection.mockReset().mockResolvedValue(null);
  });

  it('uses the shared compiler with active user and thread scope', async () => {
    mocks.compileSubjectTimelineForUser.mockResolvedValue({
      intent: { subjectQuery: 'Midnight Harbor' },
      subject: { displayName: 'Midnight Harbor' },
      ambiguity: [],
      events: [{
        title: 'Recorded a demo',
        content: 'Recorded a demo at home.',
        focusedEvidence: 'Recorded a demo at home.',
        start_time: '2026-07-20T10:00:00.000Z',
        time_precision: 'sequence_only',
        occurrence_status: 'unresolved',
        source_kind: 'current_thread',
        source_id: 'message-a',
        relevance: 0.9,
        whyIncluded: 'current-thread subject overlap',
      }],
      contextEvents: [],
      coverage: { score: 0.6, isComplete: false },
      warnings: ['provisional_current_thread_evidence'],
    });

    const response = await buildSubjectTimelineChatResponse({
      userId: 'user-a',
      message: 'Show me my Midnight Harbor timeline',
      threadId: 'thread-a',
      messageId: 'message-a',
    });
    expect(mocks.compileSubjectTimelineForUser).toHaveBeenCalledWith({
      userId: 'user-a',
      query: 'Show me my Midnight Harbor timeline',
      threadId: 'thread-a',
    });
    expect(response.response_mode).toBe('TIMELINE_DEGRADED');
    expect(response.content).toContain('provisional');
  });
});

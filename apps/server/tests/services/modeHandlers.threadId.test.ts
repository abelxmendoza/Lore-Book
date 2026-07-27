import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeExplicitRecall = vi.fn();
const recordDismissal = vi.fn();
const recordSuggestionDismissalLearning = vi.fn();

vi.mock('../../src/services/chat/explicitRecallService', () => ({
  executeExplicitRecall,
}));
vi.mock('../../src/services/suggestionDismissalService', () => ({
  suggestionDismissalService: { recordDismissal },
}));
vi.mock('../../src/services/entityLearningService', () => ({
  entityLearningService: { recordSuggestionDismissalLearning },
}));
vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { modeHandlers } from '../../src/services/modeRouter/modeHandlers';

describe('thread-scoped recall mode handlers', () => {
  beforeEach(() => {
    executeExplicitRecall.mockReset();
    recordDismissal.mockReset();
    recordSuggestionDismissalLearning.mockReset();
    executeExplicitRecall.mockResolvedValue({
      content: 'Synthetic recall result',
      response_mode: 'FOUNDATION_RECALL',
      confidence: 1,
      metadata: {},
    });
    recordDismissal.mockResolvedValue({
      dismissCount: 5,
      isPermanent: true,
      threadId: 'thread-a',
      normalizedName: 'south coast plaza',
      reason: 'noise',
    });
  });

  it('passes the active thread to foundation recall', async () => {
    await modeHandlers.handleMode('FOUNDATION_RECALL', 'user-a', 'Recall my projects', {
      threadId: 'thread-a',
    });
    expect(executeExplicitRecall).toHaveBeenCalledWith(
      'user-a',
      'Recall my projects',
      [],
      { threadId: 'thread-a' },
    );
  });

  it('uses the existing safe behavior when no thread is active', async () => {
    await expect(
      modeHandlers.handleMode('FOUNDATION_RECALL', 'user-a', 'Recall my projects'),
    ).resolves.toMatchObject({ response_mode: 'FOUNDATION_RECALL' });
    expect(executeExplicitRecall).toHaveBeenCalledWith(
      'user-a',
      'Recall my projects',
      [],
      { threadId: undefined },
    );
  });

  it('dismisses a suggestion from chat through the shared dismissal service', async () => {
    await expect(
      modeHandlers.handleMode(
        'SUGGESTION_DISMISS_WRITE',
        'user-a',
        'Dismiss the place suggestion "South Coast Plaza" because it is just noise',
        { threadId: 'thread-a' },
      ),
    ).resolves.toMatchObject({ response_mode: 'SUGGESTION_DISMISS_WRITE' });

    expect(recordDismissal).toHaveBeenCalledWith('user-a', 'locations', {
      name: 'South Coast Plaza',
      threadId: 'thread-a',
      reason: 'noise',
    });
    expect(recordSuggestionDismissalLearning).toHaveBeenCalled();
  });
});

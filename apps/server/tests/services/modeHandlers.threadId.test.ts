import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeExplicitRecall = vi.fn();

vi.mock('../../src/services/chat/explicitRecallService', () => ({
  executeExplicitRecall,
}));
vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { modeHandlers } from '../../src/services/modeRouter/modeHandlers';

describe('thread-scoped recall mode handlers', () => {
  beforeEach(() => {
    executeExplicitRecall.mockReset();
    executeExplicitRecall.mockResolvedValue({
      content: 'Synthetic recall result',
      response_mode: 'FOUNDATION_RECALL',
      confidence: 1,
      metadata: {},
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
});

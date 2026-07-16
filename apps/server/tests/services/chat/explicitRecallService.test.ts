import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeKind } = vi.hoisted(() => ({ executeKind: vi.fn() }));

vi.mock('../../../src/cognition/query/QueryEngine', () => ({
  queryEngine: {
    plan: vi.fn(() => ({ intent: 'recall' })),
    buildContext: vi.fn(() => ({ userId: 'user-1' })),
    executeKind,
  },
}));

vi.mock('../../../src/services/chat/threadRecallService', () => ({
  THREAD_RECALL_RE: /this thread/i,
  matchesThreadRecallQuery: vi.fn((message: string) => /this thread/i.test(message)),
  buildThreadRecall: vi.fn(),
}));

import { executeExplicitRecall } from '../../../src/services/chat/explicitRecallService';

describe('executeExplicitRecall — identity hierarchy precedence', () => {
  beforeEach(() => {
    executeKind.mockReset();
  });

  it('does not let recent thread context outrank an explicit Who am I request', async () => {
    executeKind.mockImplementation(async (kind: string) => {
      if (kind === 'thread') {
        return {
          raw: {
            hasContent: true,
            content: 'You recently discussed Ring and Catch One.',
            confidence: 0.9,
          },
        };
      }
      if (kind === 'structured') {
        return {
          raw: {
            intent: 'biography',
            entityName: null,
            contextBlock: [
              '## BIOGRAPHY',
              '## CORE IDENTITY',
              '- Hometown: Whittier',
              '## LIFE STORY — CHRONOLOGICAL',
              'Restaurant work came before robotics.',
              '## CURRENT CHAPTER',
              'Now working at Ring.',
            ].join('\n'),
            confidence: 0.95,
            foundationPrimary: true,
          },
        };
      }
      throw new Error(`Unexpected query kind: ${kind}`);
    });

    const result = await executeExplicitRecall(
      'user-1',
      'Who am I?',
      [
        { role: 'user', content: 'Today at Ring was intense.' },
        { role: 'assistant', content: 'That sounds intense.' },
      ],
    );

    expect(result.content).toContain('Hometown: Whittier');
    expect(result.content).toContain('Restaurant work came before robotics.');
    expect(result.content).toContain('Now working at Ring.');
    expect(result.content).not.toContain('Catch One');
    expect(executeKind).toHaveBeenCalledTimes(1);
    expect(executeKind).toHaveBeenCalledWith('structured', expect.anything());
  });
});

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

  it('falls back to journal entries instead of silence when foundation is empty', async () => {
    executeKind.mockImplementation(async (kind: string) => {
      if (kind === 'structured') {
        return {
          raw: {
            intent: 'location',
            entityName: 'Northwind Depot',
            contextBlock: 'Location not recorded.',
            confidence: 0.2,
            foundationPrimary: true,
          },
        };
      }
      if (kind === 'semantic') {
        return {
          raw: {
            silence: null,
            confidence: 0.82,
            entries: [
              {
                id: 'je-1',
                date: '2026-03-01T00:00:00.000Z',
                content: 'Went to Northwind Depot with Jamie after the shift.',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected query kind: ${kind}`);
    });

    const result = await executeExplicitRecall('user-1', 'What happened at Northwind Depot?');

    expect(result.response_mode).toBe('RECALL');
    expect(result.content).toContain('Northwind Depot');
    expect(result.content).toContain('Jamie');
    expect(result.content).not.toMatch(/nothing verified on record/i);
    expect(executeKind).toHaveBeenCalledWith('semantic', expect.anything());
  });
});

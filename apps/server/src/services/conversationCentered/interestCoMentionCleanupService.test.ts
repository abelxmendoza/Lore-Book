import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const unlink = vi.fn();

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('./interestTracker', () => ({
  interestTracker: {
    unlinkCharacterFromInterest: (...args: unknown[]) => unlink(...args),
  },
}));

import { repairFirstPersonCoMentionPollution } from './interestCoMentionCleanupService';

function chainableQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const key of [
    'select',
    'eq',
    'contains',
    'not',
    'limit',
    'order',
    'maybeSingle',
    'single',
  ]) {
    q[key] = self;
  }
  q.then = undefined;
  // terminal
  Object.assign(q, {
    then: undefined,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  });
  // make awaitable
  (q as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return q;
}

describe('interestCoMentionCleanupService', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    unlink.mockReset();
    unlink.mockResolvedValue(true);
  });

  it('unlinks non-self characters from first-person interests', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: () => ({
            eq: () => ({
              contains: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'self-1' }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'interests') {
        return chainableQuery({
          data: [
            {
              id: 'int-duolingo',
              interest_name: 'duolingo',
              related_character_ids: ['self-1', 'mom-1'],
              evidence_quotes: ["I'm an avid duolingoer"],
              description: null,
              metadata: {},
            },
          ],
          error: null,
        });
      }
      return chainableQuery({ data: null, error: null });
    });

    const result = await repairFirstPersonCoMentionPollution('user-1', { characterId: 'mom-1' });
    expect(result.repairedInterests).toBe(1);
    expect(result.unlinkedPairs).toBe(1);
    expect(unlink).toHaveBeenCalledWith('user-1', 'int-duolingo', 'mom-1', {
      reason: 'co_mention_pollution_repair',
    });
  });

  it('does not unlink clearly third-person interests', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: () => ({
            eq: () => ({
              contains: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'self-1' }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'interests') {
        return chainableQuery({
          data: [
            {
              id: 'int-knit',
              interest_name: 'knitting',
              related_character_ids: ['mom-1'],
              evidence_quotes: ['Mom loves knitting'],
              description: null,
              metadata: {},
            },
          ],
          error: null,
        });
      }
      return chainableQuery({ data: null, error: null });
    });

    const result = await repairFirstPersonCoMentionPollution('user-1', { characterId: 'mom-1' });
    expect(result.repairedInterests).toBe(0);
    expect(unlink).not.toHaveBeenCalled();
  });
});

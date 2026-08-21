import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { learnSelfRomanticIdentity } from './learnSelfRomanticIdentity';

function chain(result: { data: unknown; error?: unknown }) {
  const resolved = { data: result.data, error: result.error ?? null };
  const query: Record<string, unknown> = {};
  const self = () => query;
  query.select = self;
  query.eq = self;
  query.maybeSingle = vi.fn().mockResolvedValue(resolved);
  query.update = vi.fn(() => query);
  query.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(resolved).then(resolve, reject);
  return query;
}

describe('learnSelfRomanticIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not write another account or non-self character', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({
          data: { id: 'char-other', pronouns: null, metadata: { is_self: false } },
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await learnSelfRomanticIdentity('user-1', 'char-other', "I'm gay");
    expect(result.applied).toBe(false);
  });

  it('writes confirmed identity only onto the signed-in self character', async () => {
    const updateQuery = chain({
      data: { id: 'char-self', pronouns: null, metadata: { is_self: true } },
    });
    const factQuery = chain({ data: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'characters') return updateQuery;
      if (table === 'entity_facts') return factQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await learnSelfRomanticIdentity('user-1', 'char-self', "I'm a man and I'm bisexual.");
    expect(result.applied).toBe(true);
    expect(result.fields).toEqual(expect.arrayContaining(['sex', 'gender_identity', 'sexual_orientation']));
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sex: 'male',
          gender_identity: 'man',
          sexual_orientation: 'bisexual',
          sex_source: 'user_confirmed',
        }),
      }),
    );
  });
});

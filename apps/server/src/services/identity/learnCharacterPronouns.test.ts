import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { learnCharacterPronouns } from './learnCharacterPronouns';

function chain(result: { data: unknown; error?: unknown }, updateSpy?: ReturnType<typeof vi.fn>) {
  const resolved = { data: result.data, error: result.error ?? null };
  const query: Record<string, unknown> = {};
  const self = () => query;
  query.select = self;
  query.eq = self;
  query.maybeSingle = vi.fn().mockResolvedValue(resolved);
  query.update = updateSpy ?? vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(resolved).then(resolve, reject);
  return query;
}

describe('learnCharacterPronouns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the self character', async () => {
    fromMock.mockImplementation(() =>
      chain({ data: { id: 'char-self', name: 'You', alias: [], pronouns: null, metadata: { is_self: true } } }),
    );
    const result = await learnCharacterPronouns('user-1', 'char-self', 'She is tired.');
    expect(result.applied).toBe(false);
  });

  it('writes inferred she/her onto an empty card', async () => {
    const update = vi.fn(() => chain({ data: null }));
    fromMock.mockImplementation(() =>
      chain(
        {
          data: { id: 'char-1', name: 'Jamie', alias: [], pronouns: null, metadata: {} },
        },
        update,
      ),
    );

    const result = await learnCharacterPronouns(
      'user-1',
      'char-1',
      'Jamie said she was exhausted after the shift.',
    );
    expect(result.applied).toBe(true);
    expect(result.pronouns).toBe('she/her');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        pronouns: 'she/her',
        metadata: expect.objectContaining({ pronouns_source: 'inferred_from_chat' }),
      }),
    );
  });

  it('does not overwrite an existing inferred value with another inference', async () => {
    const update = vi.fn(() => chain({ data: null }));
    fromMock.mockImplementation(() =>
      chain(
        {
          data: {
            id: 'char-1',
            name: 'Jamie',
            alias: [],
            pronouns: 'she/her',
            metadata: { pronouns_source: 'inferred_from_chat' },
          },
        },
        update,
      ),
    );

    const result = await learnCharacterPronouns('user-1', 'char-1', 'Jamie said he was exhausted.');
    expect(result.applied).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets an explicit slash-form correct a previous inference', async () => {
    const update = vi.fn(() => chain({ data: null }));
    fromMock.mockImplementation(() =>
      chain(
        {
          data: {
            id: 'char-1',
            name: 'Jamie',
            alias: [],
            pronouns: 'she/her',
            metadata: { pronouns_source: 'inferred_from_chat' },
          },
        },
        update,
      ),
    );

    const result = await learnCharacterPronouns('user-1', 'char-1', "Jamie's pronouns are they/them.");
    expect(result.applied).toBe(true);
    expect(result.pronouns).toBe('they/them');
    expect(result.overwritten).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        pronouns: 'they/them',
        metadata: expect.objectContaining({ pronouns_source: 'user_confirmed' }),
      }),
    );
  });
});

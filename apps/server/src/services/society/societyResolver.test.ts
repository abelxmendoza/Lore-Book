import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../config', () => ({
  config: { openAiKey: 'test-key', defaultModel: 'gpt-test' },
}));
const tracedCompletion = vi.fn();
vi.mock('../../lib/openai', () => ({
  tracedCompletion: (...args: unknown[]) => tracedCompletion(...args),
}));

import { societyResolver, SocietyResolver } from './societyResolver';
import type { SocietyCluster } from './societyMapper';

function cluster(partial: Partial<SocietyCluster> & { key: string }): SocietyCluster {
  return {
    key: partial.key,
    name: partial.name ?? 'Auto Name',
    group_type: partial.group_type ?? 'friend_group',
    membership_model: 'strict',
    user_relationship: 'member',
    is_public_entity: false,
    memberIds: partial.memberIds ?? ['a', 'b'],
    memberNames: partial.memberNames ?? ['Ana', 'Ben'],
    confidence: partial.confidence ?? 0.7,
    context: 'ctx',
    evidence: partial.evidence ?? ['we hung out at the show'],
    metadata: partial.metadata ?? { anchor: 'co_occurrence' },
  };
}

function modelReply(groups: unknown[]) {
  return { choices: [{ message: { content: JSON.stringify({ groups }) } }] };
}

describe('SocietyResolver.parse', () => {
  it('parses well-formed group JSON and ignores malformed entries', () => {
    const map = SocietyResolver.parse(JSON.stringify({
      groups: [
        { key: 'k1', name: 'Los Goths', group_type: 'scene', user_relationship: 'member' },
        { key: 'k2', drop: true },
        { name: 'no key' },
        null,
      ],
    }));
    expect(map.get('k1')).toEqual({ name: 'Los Goths', group_type: 'scene', user_relationship: 'member', drop: false });
    expect(map.get('k2')?.drop).toBe(true);
    expect(map.size).toBe(2);
  });

  it('returns empty on invalid JSON', () => {
    expect(SocietyResolver.parse('not json').size).toBe(0);
  });
});

describe('SocietyResolver.resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset internal cache/budget between tests
    (societyResolver as any).cache = new Map();
    (societyResolver as any).budgetUsed = 0;
    (societyResolver as any).budgetDay = '';
  });

  it('applies the model name/type and drops coincidental clusters', async () => {
    tracedCompletion.mockResolvedValue(modelReply([
      { key: 'k1', name: 'Los Goths', group_type: 'scene', user_relationship: 'member' },
      { key: 'k2', drop: true },
    ]));

    const out = await societyResolver.resolve('user-1', [
      cluster({ key: 'k1', name: 'Ana & Ben Circle', group_type: 'friend_group' }),
      cluster({ key: 'k2' }),
    ]);

    expect(tracedCompletion).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('k1');
    expect(out[0].name).toBe('Los Goths');
    expect(out[0].group_type).toBe('scene');
    expect(out[0].metadata.llm_resolved).toBe(true);
  });

  it('never sends named employer/institution clusters to the model', async () => {
    const out = await societyResolver.resolve('user-1', [
      cluster({ key: 'emp', name: 'Kforce', group_type: 'company', metadata: { anchor: 'employer' } }),
    ]);
    expect(tracedCompletion).not.toHaveBeenCalled();
    expect(out[0].name).toBe('Kforce');
  });

  it('caches resolutions so a repeated cluster does not trigger another call', async () => {
    tracedCompletion.mockResolvedValue(modelReply([
      { key: 'k1', name: 'Los Goths', group_type: 'scene' },
    ]));
    const input = [cluster({ key: 'k1', name: 'Ana & Ben Circle' })];

    await societyResolver.resolve('user-1', input);
    await societyResolver.resolve('user-1', input);

    expect(tracedCompletion).toHaveBeenCalledTimes(1);
  });
});

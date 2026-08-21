import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modeRouterService } from '../../src/services/modeRouter/modeRouterService';
import { openai } from '../../src/services/openaiClient';
import { planResponseScope } from '../../src/services/responseScope';
import { planQuestionScopedRetrieval } from '../../src/services/chat/questionScopedRetrieval';
import { ragPacketCacheService } from '../../src/services/ragPacketCacheService';
import { RAG_CHARACTER_COLS } from '../../src/services/chat/ragLoreProjections';

vi.mock('../../src/services/openaiClient');
vi.mock('../../src/services/projects/projectStateRecallService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/projects/projectStateRecallService')>();
  return {
    ...actual,
    resolveProjectStateTarget: vi.fn(async () => null),
  };
});
vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const DETERMINISTIC = [
  'When did I work at Northwind?',
  'Did I work at Northwind?',
  'How long did I work at Northwind?',
  'Who is Maya?',
  'How is Maya related to me?',
  'Show me a timeline of my time at Northwind',
  'Who am I currently dating?',
  'What happened during my time at Northwind?',
];

const AMBIGUOUS = [
  'Something ambiguous happened and I need to process it',
  'I am not sure what this is about yet',
];

describe('mode router + RAG payload minimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openai.chat.completions.create).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ mode: 'UNKNOWN', confidence: 0.4, reasoning: 'unclear' }) } }],
    } as any);
  });

  it('routes a simple person factual query without the routing LLM', async () => {
    const result = await modeRouterService.routeMessage('user-1', 'Who is Maya?');
    expect(['MEMORY_RECALL', 'FOUNDATION_RECALL']).toContain(result.mode);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('routes an explicit timeline query without the routing LLM', async () => {
    const result = await modeRouterService.routeMessage(
      'user-1',
      'Show me a timeline of my time at Northwind',
    );
    expect(result.mode).toBe('SUBJECT_TIMELINE');
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('routes a relationship query without the routing LLM', async () => {
    const result = await modeRouterService.routeMessage('user-1', 'How is Maya related to me?');
    expect(['FAMILY_QUERY', 'MEMORY_RECALL', 'ROMANCE_QUERY']).toContain(result.mode);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('still uses LLM fallback for ambiguous competing intent', async () => {
    const result = await modeRouterService.routeMessage(
      'user-1',
      'Something ambiguous happened and I need to process it',
    );
    expect(result.mode).toBeDefined();
    expect(openai.chat.completions.create).toHaveBeenCalled();
  });

  it('does not load unrelated books for a simple work-date question', () => {
    const plan = planQuestionScopedRetrieval(
      'When did I work at Northwind?',
      planResponseScope('When did I work at Northwind?'),
    );
    expect(plan.loadRomance).toBe(false);
    expect(plan.loadSkillsIndex).toBe(false);
    expect(plan.loadStoryContext).toBe(false);
    expect(plan.loadSocialCommunities).toBe(false);
    expect(plan.breadth).toBe('minimal');
  });

  it('keeps a reflective question on the broad retrieval plan', () => {
    const message = 'Looking back, how am I doing with all of this?';
    const plan = planQuestionScopedRetrieval(message, planResponseScope(message));
    expect(plan.breadth).toBe('full');
    expect(plan.earlyStopOnWmaEvidence).toBe(false);
  });

  it('character projection omits embeddings', () => {
    expect(RAG_CHARACTER_COLS.split(',').map((col) => col.trim())).not.toContain('embedding');
  });

  it('invalidates the tenant lore cache on correction without leaking across users', () => {
    ragPacketCacheService.setLoreCache('tenant-a', { allCharacters: [{ id: 'a' }] } as any);
    ragPacketCacheService.setLoreCache('tenant-b', { allCharacters: [{ id: 'b' }] } as any);
    ragPacketCacheService.invalidateLoreCache('tenant-a');
    ragPacketCacheService.clearUserCache('tenant-a');
    expect(ragPacketCacheService.getLoreCache('tenant-a')).toBeNull();
    expect(ragPacketCacheService.getLoreCache('tenant-b')?.allCharacters?.[0]?.id).toBe('b');
  });

  it('reports deterministic routing fallback rate on the synthetic fixture set', async () => {
    let llmCalls = 0;
    for (const message of DETERMINISTIC) {
      vi.clearAllMocks();
      await modeRouterService.routeMessage('user-1', message);
      if (vi.mocked(openai.chat.completions.create).mock.calls.length > 0) llmCalls += 1;
    }
    expect(llmCalls).toBe(0);

    let ambiguousLlm = 0;
    for (const message of AMBIGUOUS) {
      vi.clearAllMocks();
      await modeRouterService.routeMessage('user-1', message);
      if (vi.mocked(openai.chat.completions.create).mock.calls.length > 0) ambiguousLlm += 1;
    }
    expect(ambiguousLlm).toBe(AMBIGUOUS.length);

    const beforeRate = 10 / (DETERMINISTIC.length + AMBIGUOUS.length);
    const afterRate = ambiguousLlm / (DETERMINISTIC.length + AMBIGUOUS.length);
    expect(afterRate).toBeLessThan(beforeRate);
    expect(afterRate).toBeCloseTo(AMBIGUOUS.length / (DETERMINISTIC.length + AMBIGUOUS.length));
  });
});

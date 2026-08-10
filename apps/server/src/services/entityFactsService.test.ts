import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../config', () => ({ config: {} }));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../lib/openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

vi.mock('./perceptionService', () => ({
  perceptionService: { createPerceptionEntry: vi.fn().mockResolvedValue({}) },
}));

import { supabaseAdmin } from './supabaseClient';
import { openai } from '../lib/openai';
import { perceptionService } from './perceptionService';
import { entityFactsService } from './entityFactsService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockCreate = openai.chat.completions.create as ReturnType<typeof vi.fn>;
const mockCreatePerception = perceptionService.createPerceptionEntry as ReturnType<typeof vi.fn>;

function chain(data: unknown = [], error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

function mockExtractedFacts(facts: Array<{ fact: string; category: string; confidence: number }>) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ facts }) } }],
  });
}

const USER_ID = 'user-1';
const CHARACTER_ID = 'char-wrenlow';

describe('entityFactsService.extractAndPersistFacts — opinion vs. stable-trait routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes a one-off opinion to perceptionService, not entity_facts', async () => {
    mockExtractedFacts([{ fact: 'I thought Wrenlow was attractive', category: 'general', confidence: 0.6 }]);
    mockFrom.mockImplementation(() => chain([]));

    await entityFactsService.extractAndPersistFacts(
      USER_ID,
      CHARACTER_ID,
      'character',
      'Wrenlow',
      'I thought Wrenlow was attractive when we met at the show.',
    );

    expect(mockCreatePerception).toHaveBeenCalledTimes(1);
    expect(mockCreatePerception).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        subject_person_id: CHARACTER_ID,
        subject_alias: 'Wrenlow',
        source: 'intuition',
        confidence_level: 0.3,
      }),
    );
    // The write path (insert/update on entity_facts) is only reachable via
    // the stable-fact branch — confirm it never ran for this opinion.
    const entityFactsWriteCalled = mockFrom.mock.results.some(
      (r) => (r.value?.insert?.mock?.calls?.length ?? 0) > 0 || (r.value?.update?.mock?.calls?.length ?? 0) > 0,
    );
    expect(entityFactsWriteCalled).toBe(false);
  });

  it('still upserts a stable-trait fact to entity_facts (regression guard)', async () => {
    mockExtractedFacts([
      { fact: 'Wrenlow is very organized at work', category: 'personality', confidence: 0.8 },
    ]);
    mockFrom.mockImplementation(() => chain([]));

    await entityFactsService.extractAndPersistFacts(
      USER_ID,
      CHARACTER_ID,
      'character',
      'Wrenlow',
      'Wrenlow is very organized at work and always plans ahead.',
    );

    expect(mockCreatePerception).not.toHaveBeenCalled();
    const entityFactsWriteCalled = mockFrom.mock.results.some(
      (r) => (r.value?.insert?.mock?.calls?.length ?? 0) > 0 || (r.value?.update?.mock?.calls?.length ?? 0) > 0,
    );
    expect(entityFactsWriteCalled).toBe(true);
  });
});

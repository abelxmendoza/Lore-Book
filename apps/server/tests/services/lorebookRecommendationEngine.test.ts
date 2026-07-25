import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lorebookRecommendationEngine } from '../../src/services/lorebook/lorebookRecommendationEngine';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { searchEntries: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function emptyChain() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  return chain;
}

describe('LorebookRecommendationEngine — character recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryService.searchEntries).mockResolvedValue([]);
  });

  it('recommends a lorebook for a character with memories, without throwing on an undeclared variable', async () => {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'character_memories') {
        const chain: any = {
          select: () => chain,
          eq: () => Promise.resolve({
            data: [{ character_id: 'char-1' }, { character_id: 'char-1' }, { character_id: 'char-1' }],
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'characters') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => Promise.resolve({
            data: [{ id: 'char-1', name: 'Jerry Medina' }],
            error: null,
          }),
        };
        return chain;
      }
      return emptyChain();
    });

    const recommendations = await lorebookRecommendationEngine.getRecommendations('user-1');

    const characterRec = recommendations.find((r) => r.type === 'character');
    expect(characterRec).toBeDefined();
    expect(characterRec?.title).toBe('My Story with Jerry Medina');
    expect(characterRec?.spec.characterIds).toEqual(['char-1']);
    expect(characterRec?.estimatedChapters).toBeGreaterThan(0);
  });

  it('returns no character recommendation when nobody has any memories', async () => {
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'character_memories') {
        const chain: any = { select: () => chain, eq: () => Promise.resolve({ data: [], error: null }) };
        return chain;
      }
      return emptyChain();
    });

    const recommendations = await lorebookRecommendationEngine.getRecommendations('user-1');

    expect(recommendations.find((r) => r.type === 'character')).toBeUndefined();
    // Full Life Story is always present regardless.
    expect(recommendations.find((r) => r.type === 'full_life')).toBeDefined();
  });
});

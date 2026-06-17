import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evolutionService } from '../../src/services/evolutionService';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/services/memoryService');

const mockLibCreate = vi.fn();
vi.mock('../../src/lib/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => mockLibCreate(...args),
      },
    },
    responses: {
      create: vi.fn(),
    },
  },
}));
vi.mock('../../src/config', () => ({ config: { openAiKey: 'test', defaultModel: 'gpt-4' } }));
vi.mock('../../src/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe('EvolutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evolutionService.invalidate('user-1');
    evolutionService.invalidate('user-2');
    mockLibCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            personaTitle: 'Test',
            personaTraits: ['A'],
            toneShift: 'x',
            emotionalPatterns: [],
            tagTrends: { top: [], rising: [], fading: [] },
            echoes: [],
            reminders: [],
            nextEra: 'y',
          }),
        },
      }],
    });
  });

  describe('analyze', () => {
    it('should return default insights when no entries', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([]);

      const { insights: result } = await evolutionService.analyze('user-1');

      expect(result).toHaveProperty('personaTitle');
      expect(result).toHaveProperty('personaTraits');
      expect(result).toHaveProperty('tagTrends');
      expect(result.personaTitle).toBeDefined();
    });

    it('should return insights from openai when entries exist', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([
        { id: 'e1', date: '2024-01-01', content: 'x', tags: ['a'], mood: 'good' },
      ] as any);

      const { insights: result } = await evolutionService.analyze('user-1');

      expect(result).toHaveProperty('personaTitle', 'Test');
      expect(result).toHaveProperty('personaTraits');
      expect(memoryService.searchEntries).toHaveBeenCalledWith('user-1', { limit: 180 });
    });

    it('returns cached insights without hitting DB on second call', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([
        { id: 'e1', date: '2024-01-01', content: 'x', tags: ['a'], mood: 'good' },
      ] as any);

      await evolutionService.analyze('user-2');
      vi.mocked(memoryService.searchEntries).mockClear();

      const { insights, timing } = await evolutionService.analyze('user-2');

      expect(insights).toHaveProperty('personaTitle', 'Test');
      expect(timing.cacheHit).toBe(true);
      expect(memoryService.searchEntries).not.toHaveBeenCalled();
    });
  });
});

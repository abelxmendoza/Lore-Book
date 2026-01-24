import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evolutionService } from '../../src/services/evolutionService';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/services/memoryService');
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function (this: unknown) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({ personaTitle: 'Test', personaTraits: ['A'], toneShift: 'x', emotionalPatterns: [], tagTrends: { top: [], rising: [], fading: [] }, echoes: [], reminders: [], nextEra: 'y' }) } }],
          }),
        },
      },
    };
  }),
}));
vi.mock('../../src/config', () => ({ config: { openAiKey: 'test', defaultModel: 'gpt-4' } }));
vi.mock('../../src/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe('EvolutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyze', () => {
    it('should return default insights when no entries', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([]);

      const result = await evolutionService.analyze('user-1');

      expect(result).toHaveProperty('personaTitle');
      expect(result).toHaveProperty('personaTraits');
      expect(result).toHaveProperty('tagTrends');
      expect(result.personaTitle).toBeDefined();
    });

    it('should return insights from openai when entries exist', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([
        { id: 'e1', date: '2024-01-01', content: 'x', tags: ['a'], mood: 'good' },
      ] as any);

      const result = await evolutionService.analyze('user-1');

      expect(result).toHaveProperty('personaTitle', 'Test');
      expect(result).toHaveProperty('personaTraits');
      expect(memoryService.searchEntries).toHaveBeenCalledWith('user-1', { limit: 180 });
    });
  });
});

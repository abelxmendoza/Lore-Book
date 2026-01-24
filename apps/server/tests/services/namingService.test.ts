import { describe, it, expect, vi, beforeEach } from 'vitest';
import { namingService } from '../../src/services/namingService';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function (this: unknown) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '  The Awakening  ' } }],
          }),
        },
      },
    };
  }),
}));
vi.mock('../../src/config', () => ({ config: { openAiKey: 'test', defaultModel: 'gpt-4' } }));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../../src/logger', () => ({ logger: { error: vi.fn() } }));

describe('NamingService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('generateChapterName', () => {
    it('returns Untitled Chapter when entries are empty', async () => {
      const name = await namingService.generateChapterName('u1', 'c1', []);
      expect(name).toBe('Untitled Chapter');
    });

    it('returns generated title when entries provided', async () => {
      const name = await namingService.generateChapterName('u1', 'c1', [
        { content: 'First day.', date: '2024-01-01' },
      ]);
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });
  });

  describe('generateSagaName', () => {
    it('returns Untitled Saga when chapters are empty', async () => {
      const name = await namingService.generateSagaName('u1', []);
      expect(name).toBe('Untitled Saga');
    });
  });
});

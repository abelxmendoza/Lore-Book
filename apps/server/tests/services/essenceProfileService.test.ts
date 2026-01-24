import { describe, it, expect, vi, beforeEach } from 'vitest';
import { essenceProfileService } from '../../src/services/essenceProfileService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { searchEntries: vi.fn().mockResolvedValue([]) },
}));
vi.mock('openai');
vi.mock('../../src/config', () => ({ config: { openAiKey: 'test', defaultModel: 'gpt-4' } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('EssenceProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns default profile when no data in DB', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      } as any);

      const profile = await essenceProfileService.getProfile('user-123');

      expect(profile).toHaveProperty('hopes');
      expect(profile).toHaveProperty('dreams');
      expect(profile).toHaveProperty('fears');
      expect(profile).toHaveProperty('strengths');
      expect(profile).toHaveProperty('weaknesses');
      expect(profile).toHaveProperty('topSkills');
      expect(profile).toHaveProperty('coreValues');
      expect(profile).toHaveProperty('personalityTraits');
      expect(profile).toHaveProperty('relationshipPatterns');
      expect(profile).toHaveProperty('evolution');
      expect(Array.isArray(profile.hopes)).toBe(true);
      expect(Array.isArray(profile.topSkills)).toBe(true);
    });

    it('returns stored profile when data exists', async () => {
      const stored = {
        hopes: [{ text: 'Hope', confidence: 0.8, extractedAt: '2024-01-01', sources: ['e1'] }],
        dreams: [], fears: [], strengths: [], weaknesses: [], topSkills: [],
        coreValues: [], personalityTraits: [], relationshipPatterns: [], evolution: [],
      };
      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { profile_data: stored }, error: null }),
      } as any);

      const profile = await essenceProfileService.getProfile('user-123');

      expect(profile.hopes).toHaveLength(1);
      expect(profile.hopes[0].text).toBe('Hope');
    });
  });
});

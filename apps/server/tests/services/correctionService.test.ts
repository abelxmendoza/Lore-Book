import { describe, it, expect, vi, beforeEach } from 'vitest';
import { correctionService } from '../../src/services/correctionService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

describe('CorrectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyCorrections', () => {
    it('should return entry with corrected_content when no corrections', () => {
      const entry = { id: 'e1', content: 'Original', metadata: {} };
      const out = correctionService.applyCorrections(entry as any);
      expect(out.corrected_content).toBe('Original');
      expect(out.corrections).toEqual([]);
    });

    it('should use latest correction text', () => {
      const entry = {
        id: 'e1',
        content: 'Original',
        metadata: { corrections: [{ corrected_text: 'First' }, { corrected_text: 'Second' }] },
      };
      const out = correctionService.applyCorrections(entry as any);
      expect(out.corrected_content).toBe('Second');
      expect(out.corrections).toHaveLength(2);
    });
  });

  describe('applyCorrectionsToEntries', () => {
    it('should map over entries', () => {
      const entries = [{ id: 'e1', content: 'A', metadata: {} }];
      const out = correctionService.applyCorrectionsToEntries(entries as any);
      expect(out).toHaveLength(1);
      expect(out[0].corrected_content).toBe('A');
    });
  });

  describe('getEntryWithCorrections', () => {
    it('should return null when supabase errors', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'err' } }),
      } as any);

      const result = await correctionService.getEntryWithCorrections('u1', 'e1');
      expect(result).toBeNull();
    });

    it('should return applied entry when data exists', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'e1', content: 'x', metadata: {} }, error: null }),
      } as any);

      const result = await correctionService.getEntryWithCorrections('u1', 'e1');
      expect(result).not.toBeNull();
      expect(result!.corrected_content).toBe('x');
    });
  });

  describe('addCorrection', () => {
    it('should throw when entry not found', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any);

      await expect(
        correctionService.addCorrection('u1', 'e1', { correctedContent: 'fix' })
      ).rejects.toThrow('Entry not found');
    });
  });
});

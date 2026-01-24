import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryGraphService } from '../../src/services/memoryGraphService';
import { chapterService } from '../../src/services/chapterService';
import { memoryService } from '../../src/services/memoryService';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';

vi.mock('../../src/services/chapterService');
vi.mock('../../src/services/memoryService');
vi.mock('../../src/services/peoplePlacesService');

describe('MemoryGraphService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryService.searchEntriesWithCorrections).mockResolvedValue([]);
    vi.mocked(chapterService.listChapters).mockResolvedValue([]);
    vi.mocked(peoplePlacesService.listEntities).mockResolvedValue([]);
  });

  describe('buildGraph', () => {
    it('should return graph with nodes and edges', async () => {
      const result = await memoryGraphService.buildGraph('user-1');

      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should call memoryService.searchEntriesWithCorrections', async () => {
      await memoryGraphService.buildGraph('user-1');
      expect(memoryService.searchEntriesWithCorrections).toHaveBeenCalledWith('user-1', { limit: 250 });
    });
  });
});

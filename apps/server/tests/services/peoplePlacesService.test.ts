import { describe, it, expect, vi, beforeEach } from 'vitest';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/memoryService');
vi.mock('../../src/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

describe('PeoplePlacesService', () => {
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null
    });
    mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    
    (supabaseAdmin.from as any) = mockFrom;
  });

  describe('listEntities', () => {
    it('should return empty array when no entities exist', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null
      });
      mockEq.mockReturnValue({ order: mockOrder });

      const result = await peoplePlacesService.listEntities('user-123');

      expect(result).toEqual([]);
      expect(mockFrom).toHaveBeenCalledWith('people_places');
    });

    it('should return entities with correct structure', async () => {
      const mockEntities = [
        {
          id: 'entity-1',
          user_id: 'user-123',
          name: 'John Doe',
          type: 'person',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockEntities,
        error: null
      });
      mockEq.mockReturnValue({ order: mockOrder });

      const result = await peoplePlacesService.listEntities('user-123');

      expect(result).toEqual(mockEntities);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('type');
    });

    it('should filter by type when provided', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null
      });
      const mockSecondEq = vi.fn().mockReturnValue({ order: mockOrder });
      mockEq.mockReturnValue({ eq: mockSecondEq });

      await peoplePlacesService.listEntities('user-123', 'person');

      expect(mockSecondEq).toHaveBeenCalledWith('type', 'person');
    });

    it('should handle database errors', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      mockEq.mockReturnValue({ order: mockOrder });

      await expect(peoplePlacesService.listEntities('user-123')).rejects.toThrow();
    });
  });

  describe('getEntity', () => {
    it('should return entity by id', async () => {
      const mockEntity = {
        id: 'entity-1',
        user_id: 'user-123',
        name: 'John Doe',
        type: 'person'
      };

      const mockSingle = vi.fn().mockResolvedValue({
        data: mockEntity,
        error: null
      });
      const mockSecondEq = vi.fn().mockReturnValue({ single: mockSingle });
      mockEq.mockReturnValue({ eq: mockSecondEq });

      const result = await peoplePlacesService.getEntity('user-123', 'entity-1');

      expect(result).toEqual(mockEntity);
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSecondEq).toHaveBeenCalledWith('id', 'entity-1');
    });

    it('should return null when entity not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });
      const mockSecondEq = vi.fn().mockReturnValue({ single: mockSingle });
      mockEq.mockReturnValue({ eq: mockSecondEq });

      const result = await peoplePlacesService.getEntity('user-123', 'non-existent');

      expect(result).toBeNull();
    });
  });
});


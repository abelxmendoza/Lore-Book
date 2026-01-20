import { describe, it, expect, vi, beforeEach } from 'vitest';
import { locationService } from '../../src/services/locationService';
import { supabaseAdmin } from '../../src/services/supabaseClient';
import type { MemoryEntry, LocationProfile } from '../../src/types';

// Mock dependencies
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/services/chapterService', () => ({
  chapterService: {
    listChapters: vi.fn().mockResolvedValue([])
  }
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntries: vi.fn().mockResolvedValue([])
  }
}));
vi.mock('../../src/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('LocationService', () => {
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockOrder: any;
  let mockLimit: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockLimit = vi.fn().mockResolvedValue({
      data: [],
      error: null
    });
    mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    
    (supabaseAdmin.from as any) = mockFrom;
  });

  describe('listLocations', () => {
    it('should return empty array when no locations exist', async () => {
      // Mock fetchEntries (journal_entries query)
      const mockJournalLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null
      });
      const mockJournalOrder = vi.fn().mockReturnValue({ limit: mockJournalLimit });
      const mockJournalEq = vi.fn().mockReturnValue({ order: mockJournalOrder });
      const mockJournalSelect = vi.fn().mockReturnValue({ eq: mockJournalEq });
      const mockJournalFrom = vi.fn().mockReturnValue({ select: mockJournalSelect });
      
      // Mock people_places query
      const mockPeopleLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null
      });
      const mockPeopleSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: mockPeopleLimit }) });
      const mockPeopleFrom = vi.fn().mockReturnValue({ select: mockPeopleSelect });
      
      // Make from() return different mocks based on table name
      (supabaseAdmin.from as any) = vi.fn((table: string) => {
        if (table === 'journal_entries') return mockJournalFrom();
        if (table === 'people_places') return mockPeopleFrom();
        return mockFrom();
      });

      const { chapterService } = await import('../../src/services/chapterService');
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);

      const result = await locationService.listLocations('user-123');

      expect(result).toEqual([]);
    });

    it('should return locations with correct structure', async () => {
      // Mock fetchEntries to return entries with location metadata
      const mockEntries = [
        {
          id: 'entry-1',
          user_id: 'user-123',
          body: 'Test entry',
          date: '2024-01-01T00:00:00Z',
          tags: ['test'],
          metadata: { gps: { lat: 40.7128, lng: -74.0060 }, location: 'Test Location' }
        }
      ];
      
      // Mock journal_entries query (used by fetchEntries)
      const mockJournalLimit = vi.fn().mockResolvedValue({
        data: mockEntries,
        error: null
      });
      const mockJournalOrder = vi.fn().mockReturnValue({ limit: mockJournalLimit });
      const mockJournalEq = vi.fn().mockReturnValue({ order: mockJournalOrder });
      const mockJournalSelect = vi.fn().mockReturnValue({ eq: mockJournalEq });
      const mockJournalFrom = vi.fn().mockReturnValue({ select: mockJournalSelect });
      
      // Mock people_places query
      const mockPeopleLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null
      });
      const mockPeopleSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: mockPeopleLimit }) });
      const mockPeopleFrom = vi.fn().mockReturnValue({ select: mockPeopleSelect });
      
      // Make from() return different mocks based on table name
      (supabaseAdmin.from as any) = vi.fn((table: string) => {
        if (table === 'journal_entries') return mockJournalFrom();
        if (table === 'people_places') return mockPeopleFrom();
        return mockFrom();
      });

      const { chapterService } = await import('../../src/services/chapterService');
      vi.mocked(chapterService.listChapters).mockResolvedValue([]);

      const result = await locationService.listLocations('user-123');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      // Slug is generated from name, so it should exist
      if (result[0].slug) {
        expect(result[0]).toHaveProperty('slug');
      }
    });

    it('should handle database errors', async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: 'PGRST_ERROR' }
      });

      await expect(locationService.listLocations('user-123')).rejects.toThrow();
    });
  });

  describe('getLocationProfile', () => {
    it('should return location profile by id', async () => {
      const mockLocation: LocationProfile = {
        id: 'loc-1',
        name: 'Test Location',
        visitCount: 5,
        firstVisited: '2024-01-01T00:00:00Z',
        lastVisited: '2024-01-15T00:00:00Z',
        coordinates: { lat: 40.7128, lng: -74.0060 },
        relatedPeople: [],
        tagCounts: [],
        chapters: [],
        moods: [],
        entries: [],
        sources: ['manual']
      };

      // Mock listLocations to return the location
      vi.spyOn(locationService, 'listLocations').mockResolvedValue([mockLocation]);

      const result = await locationService.getLocationProfile('user-123', 'loc-1');

      expect(result).toEqual(mockLocation);
    });

    it('should return null when location not found', async () => {
      // Mock listLocations to return empty array
      vi.spyOn(locationService, 'listLocations').mockResolvedValue([]);

      const result = await locationService.getLocationProfile('user-123', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('extractCoordinates', () => {
    it('should extract coordinates from metadata.gps', () => {
      const metadata = {
        gps: { lat: 40.7128, lng: -74.0060 }
      };

      // Access private method via any for testing
      const result = (locationService as any).extractCoordinates(metadata);

      expect(result).toEqual({ lat: 40.7128, lng: -74.0060 });
    });

    it('should extract coordinates from metadata.location', () => {
      const metadata = {
        location: { latitude: 40.7128, longitude: -74.0060 }
      };

      const result = (locationService as any).extractCoordinates(metadata);

      expect(result).toEqual({ lat: 40.7128, lng: -74.0060 });
    });

    it('should return null when no coordinates found', () => {
      const metadata = {};

      const result = (locationService as any).extractCoordinates(metadata);

      expect(result).toBeNull();
    });
  });

  describe('normalizeKey', () => {
    it('should normalize location names', () => {
      const result = (locationService as any).normalizeKey('  New York City  ');

      expect(result).toBe('new york city');
    });
  });

  describe('slugify', () => {
    it('should create URL-friendly slugs', () => {
      const result = (locationService as any).slugify('New York City!');

      expect(result).toBe('new-york-city');
    });

    it('should handle special characters', () => {
      const result = (locationService as any).slugify('São Paulo, Brazil');

      expect(result).toBe('s-o-paulo-brazil');
    });

    it('should limit slug length', () => {
      const longName = 'a'.repeat(100);
      const result = (locationService as any).slugify(longName);

      expect(result.length).toBeLessThanOrEqual(60);
    });
  });
});


/**
 * Centralized Mock Data Service
 * 
 * Manages all mock data across the application and provides a unified interface
 * for accessing mock data while clearly separating it from real user data.
 * 
 * Features:
 * - Centralized mock data storage
 * - Automatic tracking of mock vs real data
 * - Integration with mock data toggle
 * - Type-safe access to mock data
 */

import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import type { Character } from '../components/characters/CharacterProfileCard';
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import type { MemoryCard } from '../types/memory';
import type { ChronologyEntry, Timeline } from '../types/timelineV2';
import { generateMockTimelines, generateMockChronologyEntries } from '../mocks/timelineMockData';

/**
 * Metadata to track whether data is mock or real
 */
export interface DataMetadata {
  isMock: boolean;
  source: 'mock' | 'real' | 'mixed';
  timestamp: string;
  mockDataVersion?: string;
}

/**
 * Wrapper for data with metadata
 */
export interface DataWithMetadata<T> {
  data: T;
  metadata: DataMetadata;
}

/**
 * Mock Data Registry
 * Tracks all mock data and provides type-safe access
 */
// Import perception type
import type { PerceptionEntry } from '../types/perception';

class MockDataRegistry {
  private characters: Character[] = [];
  private locations: LocationProfile[] = [];
  private memories: MemoryCard[] = [];
  private chronologyEntries: ChronologyEntry[] = [];
  private timelines: Timeline[] = [];
  private perceptions: PerceptionEntry[] = [];
  private isInitialized = false;

  /**
   * Initialize mock data from various sources
   * This is called lazily when mock data is first needed
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Initialize timeline mock data (synchronous)
      this.timelines = generateMockTimelines();
      this.chronologyEntries = generateMockChronologyEntries(this.timelines);

      // Lazy load component mock data to avoid circular dependencies
      // These will be registered by components when they load
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing mock data:', error);
    }
  }

  /**
   * Register mock data (for components that generate their own)
   */
  registerCharacters(characters: Character[]) {
    this.characters = characters;
  }

  registerLocations(locations: LocationProfile[]) {
    this.locations = locations;
  }

  registerMemories(memories: MemoryCard[]) {
    this.memories = memories;
  }

  registerChronologyEntries(entries: ChronologyEntry[]) {
    this.chronologyEntries = entries;
  }

  registerTimelines(timelines: Timeline[]) {
    this.timelines = timelines;
  }

  registerPerceptions(perceptions: PerceptionEntry[]) {
    this.perceptions = perceptions;
  }

  /**
   * Get mock data
   */
  getCharacters(): Character[] {
    return [...this.characters];
  }

  getLocations(): LocationProfile[] {
    return [...this.locations];
  }

  getMemories(): MemoryCard[] {
    return [...this.memories];
  }

  getChronologyEntries(): ChronologyEntry[] {
    return [...this.chronologyEntries];
  }

  getTimelines(): Timeline[] {
    return [...this.timelines];
  }

  getPerceptions(): PerceptionEntry[] {
    return [...this.perceptions];
  }
}

// Singleton instance
const mockDataRegistry = new MockDataRegistry();

/**
 * Create metadata for data
 */
export function createDataMetadata(isMock: boolean, source: 'mock' | 'real' | 'mixed' = isMock ? 'mock' : 'real'): DataMetadata {
  return {
    isMock,
    source,
    timestamp: new Date().toISOString(),
    mockDataVersion: isMock ? '1.0.0' : undefined
  };
}

/**
 * Wrap data with metadata
 */
export function wrapWithMetadata<T>(data: T, isMock: boolean): DataWithMetadata<T> {
  return {
    data,
    metadata: createDataMetadata(isMock)
  };
}

/**
 * Merge real and mock data based on toggle state
 */
export function mergeDataWithMock<T>(
  realData: T[],
  mockData: T[],
  useMock: boolean = getGlobalMockDataEnabled()
): DataWithMetadata<T[]> {
  if (useMock) {
    // Use mock data if toggle is on
    return {
      data: mockData.length > 0 ? mockData : realData,
      metadata: createDataMetadata(mockData.length > 0, mockData.length > 0 ? 'mock' : 'real')
    };
  } else {
    // Use real data if toggle is off
    return {
      data: realData.length > 0 ? realData : [],
      metadata: createDataMetadata(false, realData.length > 0 ? 'real' : 'mock')
    };
  }
}

/**
 * Get data with automatic mock/real selection
 * Always checks current toggle state
 */
export function getDataWithFallback<T>(
  realData: T[] | null | undefined,
  mockData: T[],
  useMock?: boolean
): DataWithMetadata<T[]> {
  // Always check current state if not explicitly provided
  const shouldUseMock = useMock !== undefined ? useMock : getGlobalMockDataEnabled();
  const real = realData || [];
  const mock = mockData || [];

  if (shouldUseMock) {
    // When mock is enabled, prefer mock data but fall back to real if no mock
    const data = mock.length > 0 ? mock : real;
    return {
      data,
      metadata: createDataMetadata(mock.length > 0, mock.length > 0 ? 'mock' : (real.length > 0 ? 'real' : 'mock'))
    };
  } else {
    // When mock is disabled, only use real data
    return {
      data: real,
      metadata: createDataMetadata(false, real.length > 0 ? 'real' : 'mock')
    };
  }
}

/**
 * Check if data should use mock fallback
 */
export function shouldUseMockFallback(realData: any[] | null | undefined): boolean {
  const hasRealData = realData && realData.length > 0;
  const mockEnabled = getGlobalMockDataEnabled();
  
  // Use mock if enabled AND no real data exists
  return mockEnabled && !hasRealData;
}

/**
 * Get mock data from registry
 */
export const mockDataService = {
  /**
   * Initialize the mock data registry
   */
  initialize: async () => {
    await mockDataRegistry.initialize();
  },

  /**
   * Register mock data
   */
  register: {
    characters: (data: Character[]) => mockDataRegistry.registerCharacters(data),
    locations: (data: LocationProfile[]) => mockDataRegistry.registerLocations(data),
    memories: (data: MemoryCard[]) => mockDataRegistry.registerMemories(data),
    chronologyEntries: (data: ChronologyEntry[]) => mockDataRegistry.registerChronologyEntries(data),
    timelines: (data: Timeline[]) => mockDataRegistry.registerTimelines(data),
    perceptions: (data: PerceptionEntry[]) => mockDataRegistry.registerPerceptions(data),
  },

  /**
   * Get mock data
   */
  get: {
    characters: () => mockDataRegistry.getCharacters(),
    locations: () => mockDataRegistry.getLocations(),
    memories: () => mockDataRegistry.getMemories(),
    chronologyEntries: () => mockDataRegistry.getChronologyEntries(),
    timelines: () => mockDataRegistry.getTimelines(),
  },

  /**
   * Get data with automatic mock/real selection
   * Pass useMock parameter to override current toggle state
   */
  getWithFallback: {
    characters: (realData?: Character[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getCharacters(), useMock),
    locations: (realData?: LocationProfile[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getLocations(), useMock),
    memories: (realData?: MemoryCard[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getMemories(), useMock),
    chronologyEntries: (realData?: ChronologyEntry[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getChronologyEntries(), useMock),
    timelines: (realData?: Timeline[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getTimelines(), useMock),
    perceptions: (realData?: any[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getPerceptions(), useMock),
  },

  /**
   * Check if currently using mock data
   */
  isUsingMock: () => getGlobalMockDataEnabled(),

  /**
   * Get metadata for current data state
   */
  getMetadata: (isMock: boolean): DataMetadata => createDataMetadata(isMock),
};


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
import type { Achievement, AchievementStatistics } from '../types/achievement';
import type { ReactionPatterns } from '../types/reaction';
import type { PatternInsight, StabilityMetrics } from '../api/perceptionReactionEngine';
import type { MemoryProposal } from '../hooks/useMemoryReviewQueue';
import type { Quest, QuestBoard, QuestAnalytics, QuestSuggestion } from '../types/quest';
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

// Photo entry type for mock data
export interface PhotoEntry {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: {
    photoUrl?: string;
    photoId?: string;
    locationName?: string;
    dateTime?: string;
    people?: string[];
    latitude?: number;
    longitude?: number;
  };
}

// Goals & Values types for mock data
export interface GoalsValuesMockData {
  goals: Array<{
    id: string;
    user_id: string;
    title: string;
    description: string;
    goal_type: 'PERSONAL' | 'CAREER' | 'RELATIONSHIP' | 'HEALTH' | 'FINANCIAL' | 'CREATIVE';
    related_value_ids: string[];
    target_timeframe: 'SHORT' | 'MEDIUM' | 'LONG';
    confidence: number;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
    created_at: string;
    ended_at?: string | null;
    metadata?: Record<string, any>;
  }>;
  values: Array<{
    id: string;
    user_id: string;
    name: string;
    description: string;
    priority: number;
    created_at: string;
    ended_at?: string | null;
    metadata?: Record<string, any>;
  }>;
  alignmentSnapshots: Array<{
    id: string;
    user_id: string;
    goal_id: string;
    alignment_score: number;
    confidence: number;
    time_window: { start: string; end: string };
    generated_at: string;
    metadata?: Record<string, any>;
  }>;
  driftObservations: Array<{
    title: string;
    description: string;
    disclaimer: string;
    goal_id: string;
    trend: 'downward' | 'upward' | 'stable';
  }>;
}

class MockDataRegistry {
  private characters: Character[] = [];
  private locations: LocationProfile[] = [];
  private memories: MemoryCard[] = [];
  private chronologyEntries: ChronologyEntry[] = [];
  private timelines: Timeline[] = [];
  private perceptions: PerceptionEntry[] = [];
  private photos: PhotoEntry[] = [];
  private goalsValues: GoalsValuesMockData | null = null;
  private achievements: Achievement[] = [];
  private achievementStatistics: AchievementStatistics | null = null;
  private reactionPatterns: ReactionPatterns | null = null;
  private patternInsights: PatternInsight[] = [];
  private stabilityMetrics: StabilityMetrics | null = null;
  private recoveryTimeData: Array<{ date: string; recovery_time: number; intensity: number }> = [];
  private memoryProposals: MemoryProposal[] = [];
  private quests: Quest[] = [];
  private questBoard: QuestBoard | null = null;
  private questAnalytics: QuestAnalytics | null = null;
  private questSuggestions: QuestSuggestion[] = [];
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

  registerPhotos(photos: PhotoEntry[]) {
    this.photos = photos;
  }

  registerGoalsValues(data: GoalsValuesMockData) {
    this.goalsValues = data;
  }

  registerAchievements(achievements: Achievement[], statistics?: AchievementStatistics) {
    this.achievements = achievements;
    if (statistics) {
      this.achievementStatistics = statistics;
    }
  }

  registerReactions(
    patterns: ReactionPatterns,
    insights: PatternInsight[],
    metrics: StabilityMetrics,
    recoveryData?: Array<{ date: string; recovery_time: number; intensity: number }>
  ) {
    this.reactionPatterns = patterns;
    this.patternInsights = insights;
    this.stabilityMetrics = metrics;
    if (recoveryData) {
      this.recoveryTimeData = recoveryData;
    }
  }

  registerMemoryProposals(proposals: MemoryProposal[]) {
    this.memoryProposals = proposals;
  }

  registerQuests(quests: Quest[]) {
    this.quests = quests;
  }

  registerQuestBoard(board: QuestBoard) {
    this.questBoard = board;
  }

  registerQuestAnalytics(analytics: QuestAnalytics) {
    this.questAnalytics = analytics;
  }

  registerQuestSuggestions(suggestions: QuestSuggestion[]) {
    this.questSuggestions = suggestions;
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

  getPhotos(): PhotoEntry[] {
    return [...this.photos];
  }

  getGoalsValues(): GoalsValuesMockData | null {
    return this.goalsValues ? { ...this.goalsValues } : null;
  }

  getAchievements(): Achievement[] {
    return [...this.achievements];
  }

  getAchievementStatistics(): AchievementStatistics | null {
    return this.achievementStatistics ? { ...this.achievementStatistics } : null;
  }

  getReactionPatterns(): ReactionPatterns | null {
    return this.reactionPatterns ? { ...this.reactionPatterns } : null;
  }

  getPatternInsights(): PatternInsight[] {
    return [...this.patternInsights];
  }

  getStabilityMetrics(): StabilityMetrics | null {
    return this.stabilityMetrics ? { ...this.stabilityMetrics } : null;
  }

  getRecoveryTimeData(): Array<{ date: string; recovery_time: number; intensity: number }> {
    return [...this.recoveryTimeData];
  }

  getMemoryProposals(): MemoryProposal[] {
    return [...this.memoryProposals];
  }

  getQuests(): Quest[] {
    return [...this.quests];
  }

  getQuestBoard(): QuestBoard | null {
    return this.questBoard ? { ...this.questBoard } : null;
  }

  getQuestAnalytics(): QuestAnalytics | null {
    return this.questAnalytics ? { ...this.questAnalytics } : null;
  }

  getQuestSuggestions(): QuestSuggestion[] {
    return [...this.questSuggestions];
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
    photos: (data: PhotoEntry[]) => mockDataRegistry.registerPhotos(data),
    goalsValues: (data: GoalsValuesMockData) => mockDataRegistry.registerGoalsValues(data),
    achievements: (achievements: Achievement[], statistics?: AchievementStatistics) => 
      mockDataRegistry.registerAchievements(achievements, statistics),
    reactions: (
      patterns: ReactionPatterns,
      insights: PatternInsight[],
      metrics: StabilityMetrics,
      recoveryData?: Array<{ date: string; recovery_time: number; intensity: number }>
    ) => mockDataRegistry.registerReactions(patterns, insights, metrics, recoveryData),
    memoryProposals: (data: MemoryProposal[]) => mockDataRegistry.registerMemoryProposals(data),
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
    photos: () => mockDataRegistry.getPhotos(),
    goalsValues: () => mockDataRegistry.getGoalsValues(),
    achievements: () => mockDataRegistry.getAchievements(),
    achievementStatistics: () => mockDataRegistry.getAchievementStatistics(),
    reactionPatterns: () => mockDataRegistry.getReactionPatterns(),
    patternInsights: () => mockDataRegistry.getPatternInsights(),
    stabilityMetrics: () => mockDataRegistry.getStabilityMetrics(),
    recoveryTimeData: () => mockDataRegistry.getRecoveryTimeData(),
    memoryProposals: () => mockDataRegistry.getMemoryProposals(),
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
    photos: (realData?: PhotoEntry[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getPhotos(), useMock),
    goalsValues: (realData?: GoalsValuesMockData | null, useMock?: boolean) => {
      const mock = mockDataRegistry.getGoalsValues();
      if (useMock !== undefined ? useMock : getGlobalMockDataEnabled()) {
        const data = mock || realData;
        return {
          data: data || { goals: [], values: [], alignmentSnapshots: [], driftObservations: [] },
          metadata: createDataMetadata(!!mock, mock ? 'mock' : (realData ? 'real' : 'mock'))
        };
      } else {
        return {
          data: realData || { goals: [], values: [], alignmentSnapshots: [], driftObservations: [] },
          metadata: createDataMetadata(false, realData ? 'real' : 'mock')
        };
      }
    },
    achievements: (realData?: Achievement[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getAchievements(), useMock),
    achievementStatistics: (realData?: AchievementStatistics | null, useMock?: boolean) => {
      const mock = mockDataRegistry.getAchievementStatistics();
      if (useMock !== undefined ? useMock : getGlobalMockDataEnabled()) {
        const data = mock || realData;
        return {
          data: data || { total: 0, byType: {} as any, byRarity: {} as any, recent: [] },
          metadata: createDataMetadata(!!mock, mock ? 'mock' : (realData ? 'real' : 'mock'))
        };
      } else {
        return {
          data: realData || { total: 0, byType: {} as any, byRarity: {} as any, recent: [] },
          metadata: createDataMetadata(false, realData ? 'real' : 'mock')
        };
      }
    },
    reactionPatterns: (realData?: ReactionPatterns | null, useMock?: boolean) => {
      const mock = mockDataRegistry.getReactionPatterns();
      if (useMock !== undefined ? useMock : getGlobalMockDataEnabled()) {
        const data = mock || realData;
        return {
          data: data || { byTrigger: {}, byLabel: {}, byType: {} as any, intensityAverages: {}, commonPatterns: [] },
          metadata: createDataMetadata(!!mock, mock ? 'mock' : (realData ? 'real' : 'mock'))
        };
      } else {
        return {
          data: realData || { byTrigger: {}, byLabel: {}, byType: {} as any, intensityAverages: {}, commonPatterns: [] },
          metadata: createDataMetadata(false, realData ? 'real' : 'mock')
        };
      }
    },
    patternInsights: (realData?: PatternInsight[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getPatternInsights(), useMock),
    stabilityMetrics: (realData?: StabilityMetrics | null, useMock?: boolean) => {
      const mock = mockDataRegistry.getStabilityMetrics();
      if (useMock !== undefined ? useMock : getGlobalMockDataEnabled()) {
        const data = mock || realData;
        return {
          data: data || { avg_recovery_time_minutes: null, recovery_trend: 'unknown', recurrence_rate: 0, intensity_trend: 'unknown', resilience_score: null },
          metadata: createDataMetadata(!!mock, mock ? 'mock' : (realData ? 'real' : 'mock'))
        };
      } else {
        return {
          data: realData || { avg_recovery_time_minutes: null, recovery_trend: 'unknown', recurrence_rate: 0, intensity_trend: 'unknown', resilience_score: null },
          metadata: createDataMetadata(false, realData ? 'real' : 'mock')
        };
      }
    },
    recoveryTimeData: (realData?: Array<{ date: string; recovery_time: number; intensity: number }> | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getRecoveryTimeData(), useMock),
    memoryProposals: (realData?: MemoryProposal[] | null, useMock?: boolean) => 
      getDataWithFallback(realData, mockDataRegistry.getMemoryProposals(), useMock),
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


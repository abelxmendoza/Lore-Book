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
import type { Quest, QuestBoard, QuestAnalytics, QuestSuggestion, QuestStatus, QuestHistory } from '../types/quest';
import type { Skill } from '../types/skill';
import type { SkillSuggestion } from '../api/skills';
import type { LocationSuggestion } from '../api/entitySuggestions';
import { emitDemoEffect, demoEffectMessage } from './demoMutationEffects';
import { generateMockTimelines, generateMockChronologyEntries } from '../mocks/timelineMockData';
import { MOCK_QUESTS, buildQuestBoardFromQuests } from '../mocks/quests';
import { MOCK_GOALS_VALUES_DATA } from '../mocks/goalsValues';
import type { UnifiedNarrativeData } from '../mocks/unifiedNarrativeData';
import {
  getCharacterRelationships,
  getCharacterLocations,
  getCharacterSkills,
  getCharacterEvents,
  getCharacterMemories,
  getLocationCharacters,
  getLocationEvents,
  getSkillCharacters,
  getSkillEvents,
  getEventCharacters,
  getEventLocations,
  getEventSkills,
  getEventMemories,
  getMemoryCharacters,
  getMemoryLocations,
  getMemorySkills,
  getMemoryEvents,
  getEntityRelationships,
  type CharacterRelationship,
  type LocationVisit,
  type SkillRelationship,
} from '../mocks/entityRelationshipDiagrams';

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
  private skills: Skill[] = [];
  private locationSuggestions: LocationSuggestion[] = [];
  private skillSuggestions: SkillSuggestion[] = [];
  private questReflections = new Map<string, QuestHistory[]>();
  private unifiedNarrativeData: UnifiedNarrativeData | null = null;
  private isInitialized = false;
  private revision = 0;
  private listeners = new Set<() => void>();

  getRevision(): number {
    return this.revision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(
    scope: 'quests' | 'characters' | 'goals' | 'locations' | 'skills' | 'memories' | 'all' = 'all',
  ): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
    if (typeof window === 'undefined') return;
    if (scope === 'quests' || scope === 'all') {
      window.dispatchEvent(new Event('lk:quests-updated'));
    }
    if (scope === 'characters' || scope === 'all') {
      window.dispatchEvent(new Event('lk:characters-updated'));
    }
    if (scope === 'goals' || scope === 'all') {
      window.dispatchEvent(new Event('lk:story-data-updated'));
    }
    if (scope === 'locations' || scope === 'all') {
      window.dispatchEvent(new Event('lk:locations-updated'));
    }
    if (scope === 'skills' || scope === 'all') {
      window.dispatchEvent(new Event('lk:skills-updated'));
    }
    if (scope === 'memories' || scope === 'all') {
      window.dispatchEvent(new CustomEvent('lk:memories-updated'));
    }
  }

  private seededQuests(): Quest[] {
    const current = this.getQuests();
    return current.length > 0 ? current : [...MOCK_QUESTS];
  }

  private syncQuestCollection(next: Quest[]): Quest[] {
    this.quests = next;
    this.questBoard = buildQuestBoardFromQuests(next);
    this.emitChange('quests');
    return next;
  }

  createQuest(quest: Quest): Quest {
    this.syncQuestCollection([...this.seededQuests(), quest]);
    emitDemoEffect({
      kind: 'quest_created',
      ...demoEffectMessage('quest_created', quest.title),
    });
    return quest;
  }

  patchQuest(questId: string, patch: Partial<Quest>): Quest {
    let updated: Quest | null = null;
    this.syncQuestCollection(
      this.seededQuests().map((quest) => {
        if (quest.id !== questId) return quest;
        updated = {
          ...quest,
          ...patch,
          updated_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        };
        return updated;
      }),
    );
    if (!updated) throw new Error('Quest not found');
    return updated;
  }

  setQuestStatus(questId: string, status: QuestStatus, extra: Partial<Quest> = {}): Quest {
    const updated = this.patchQuest(questId, { status, ...extra });
    if (status === 'completed') {
      emitDemoEffect({
        kind: 'quest_completed',
        ...demoEffectMessage('quest_completed', updated.title),
      });
    } else {
      emitDemoEffect({
        kind: 'quest_updated',
        ...demoEffectMessage('quest_updated', `Quest marked ${status.replace('_', ' ')}`),
      });
    }
    return updated;
  }

  removeQuest(questId: string): void {
    this.syncQuestCollection(this.seededQuests().filter((quest) => quest.id !== questId));
  }

  removeQuestSuggestion(match: { id?: string; title?: string }): void {
    const key = match.title?.trim().toLowerCase();
    this.questSuggestions = this.getQuestSuggestions().filter((s) => {
      if (match.id && s.id === match.id) return false;
      if (key && s.title.trim().toLowerCase() === key) return false;
      return true;
    });
    this.emitChange('quests');
  }

  upsertCharacter(character: Character): Character {
    const list = this.getCharacters();
    const idx = list.findIndex((c) => c.id === character.id);
    const next =
      idx >= 0
        ? list.map((c, i) => (i === idx ? { ...c, ...character } : c))
        : [...list, character];
    this.registerCharacters(next);
    this.emitChange('characters');
    const label = character.name || 'Character';
    if (character.status === 'archived') {
      emitDemoEffect({
        kind: 'character_archived',
        ...demoEffectMessage('character_archived', label),
      });
    } else {
      emitDemoEffect({
        kind: 'character_saved',
        ...demoEffectMessage('character_saved', label),
      });
    }
    return character;
  }

  removeCharacter(characterId: string): void {
    this.registerCharacters(this.getCharacters().filter((c) => c.id !== characterId));
    this.emitChange('characters');
  }

  ensureGoalsValuesSeed(): GoalsValuesMockData {
    if (!this.goalsValues) {
      this.goalsValues = {
        goals: [...MOCK_GOALS_VALUES_DATA.goals],
        values: [...MOCK_GOALS_VALUES_DATA.values],
        alignmentSnapshots: [...MOCK_GOALS_VALUES_DATA.alignmentSnapshots],
        driftObservations: [...MOCK_GOALS_VALUES_DATA.driftObservations],
      };
    }
    return this.goalsValues;
  }

  updateValuePriority(valueId: string, priority: number): void {
    const current = this.ensureGoalsValuesSeed();
    const value = current.values.find((v) => v.id === valueId);
    this.goalsValues = {
      ...current,
      values: current.values.map((entry) =>
        entry.id === valueId ? { ...entry, priority } : entry,
      ),
    };
    this.emitChange('goals');
    emitDemoEffect({
      kind: 'value_priority',
      ...demoEffectMessage('value_priority', value?.name ?? 'value'),
    });
  }

  createLocation(input: { name: string; type?: string | null; context?: string }): LocationProfile {
    const now = new Date().toISOString();
    const location: LocationProfile = {
      id: `loc-mock-${Date.now()}`,
      name: input.name,
      type: input.type ?? null,
      visitCount: 1,
      firstVisited: now,
      lastVisited: now,
      relatedPeople: [],
      tagCounts: input.type ? [{ tag: input.type, count: 1 }] : [],
      chapters: [],
      moods: [],
      entries: [],
      sources: ['demo'],
      description: input.context ?? null,
    };
    this.locations = [...this.getLocations(), location];
    this.emitChange('locations');
    emitDemoEffect({
      kind: 'location_added',
      ...demoEffectMessage('location_added', input.name),
    });
    return location;
  }

  removeLocationSuggestion(match: { id?: string; name?: string }): void {
    const key = match.name?.trim().toLowerCase();
    this.locationSuggestions = this.getLocationSuggestions().filter((s) => {
      if (match.id && s.id === match.id) return false;
      if (key && s.name.trim().toLowerCase() === key) return false;
      return true;
    });
    this.emitChange('locations');
  }

  updateLocation(id: string, patch: Partial<LocationProfile>): LocationProfile | null {
    const locations = this.getLocations();
    const idx = locations.findIndex((loc) => loc.id === id);
    if (idx < 0) return null;
    const current = locations[idx];
    const updated: LocationProfile = {
      ...current,
      ...patch,
      metadata: patch.metadata ? { ...(current.metadata ?? {}), ...patch.metadata } : current.metadata,
    };
    this.locations = locations.map((loc, i) => (i === idx ? updated : loc));
    this.emitChange('locations');
    return updated;
  }

  createSkillFromSuggestion(suggestion: SkillSuggestion): Skill {
    const now = new Date().toISOString();
    const skill: Skill = {
      id: `skill-mock-${Date.now()}`,
      user_id: 'demo',
      skill_name: suggestion.skill_name,
      skill_category: suggestion.skill_category,
      current_level: 1,
      total_xp: 35,
      xp_to_next_level: 65,
      description: suggestion.description ?? suggestion.origin_story ?? null,
      first_mentioned_at: now,
      last_practiced_at: now,
      practice_count: 1,
      auto_detected: true,
      confidence_score: suggestion.confidence ?? 0.75,
      is_active: true,
      metadata: suggestion.skill_type
        ? { skill_profile: { skill_type: suggestion.skill_type, proficiency: suggestion.proficiency ?? 40 } }
        : {},
      created_at: now,
      updated_at: now,
    };
    this.skills = [...this.getSkills(), skill];
    this.emitChange('skills');
    emitDemoEffect({
      kind: 'skill_added',
      ...demoEffectMessage('skill_added', suggestion.skill_name),
    });
    return skill;
  }

  removeSkillSuggestion(match: { id?: string; skill_name?: string }): void {
    const key = match.skill_name?.trim().toLowerCase();
    this.skillSuggestions = this.getSkillSuggestions().filter((s) => {
      if (match.id && s.id === match.id) return false;
      if (key && s.skill_name.trim().toLowerCase() === key) return false;
      return true;
    });
    this.emitChange('skills');
  }

  ensureMemoryProposalsSeed(proposals: MemoryProposal[]): MemoryProposal[] {
    if (this.memoryProposals.length === 0) {
      this.memoryProposals = [...proposals];
    }
    return this.getMemoryProposals();
  }

  resolveMemoryProposal(
    id: string,
    status: MemoryProposal['status'],
    patch: Partial<MemoryProposal> = {},
  ): void {
    const proposal = this.getMemoryProposals().find((p) => p.id === id);
    this.memoryProposals = this.getMemoryProposals().map((entry) =>
      entry.id === id
        ? {
            ...entry,
            ...patch,
            status,
            resolved_at: new Date().toISOString(),
          }
        : entry,
    );
    this.emitChange('memories');
    const label = proposal?.claim_text?.slice(0, 72) ?? 'Proposal';
    if (status === 'APPROVED') {
      emitDemoEffect({
        kind: 'memory_approved',
        ...demoEffectMessage('memory_approved', label),
      });
    } else if (status === 'REJECTED') {
      emitDemoEffect({
        kind: 'memory_rejected',
        ...demoEffectMessage('memory_rejected', label),
      });
    } else if (status === 'EDITED') {
      emitDemoEffect({
        kind: 'memory_edited',
        ...demoEffectMessage('memory_edited', label),
      });
    } else if (status === 'DEFERRED') {
      emitDemoEffect({
        kind: 'memory_deferred',
        ...demoEffectMessage('memory_deferred', label),
      });
    }
  }

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

  registerSkills(skills: Skill[]) {
    this.skills = skills;
  }

  registerLocationSuggestions(suggestions: LocationSuggestion[]) {
    this.locationSuggestions = suggestions;
  }

  registerSkillSuggestions(suggestions: SkillSuggestion[]) {
    this.skillSuggestions = suggestions;
  }

  registerUnifiedNarrative(data: UnifiedNarrativeData) {
    this.unifiedNarrativeData = data;
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
    return this.memoryProposals.filter((proposal) => proposal.status === 'PENDING');
  }

  getSkills(): Skill[] {
    return [...this.skills];
  }

  getLocationSuggestions(): LocationSuggestion[] {
    return [...this.locationSuggestions];
  }

  getSkillSuggestions(): SkillSuggestion[] {
    return [...this.skillSuggestions];
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

  getQuestReflections(questId: string): QuestHistory[] {
    return [...(this.questReflections.get(questId) ?? [])];
  }

  addQuestReflection(questId: string, reflection: string): QuestHistory {
    const entry: QuestHistory = {
      id: `refl-${Date.now()}`,
      quest_id: questId,
      event_type: 'reflection',
      description: 'Reflection added',
      notes: reflection,
      created_at: new Date().toISOString(),
    };
    this.questReflections.set(questId, [...this.getQuestReflections(questId), entry]);
    this.emitChange('quests');
    return entry;
  }

  getUnifiedNarrative(): UnifiedNarrativeData | null {
    return this.unifiedNarrativeData;
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
    // Demo Mode must never fall back to live account data.
    return {
      data: mockData,
      metadata: createDataMetadata(true, 'mock')
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
    // Demo Mode must never fall back to live account data.
    return {
      data: mock,
      metadata: createDataMetadata(true, 'mock')
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
    quests: (data: Quest[]) => mockDataRegistry.registerQuests(data),
    questBoard: (data: QuestBoard) => mockDataRegistry.registerQuestBoard(data),
    questAnalytics: (data: QuestAnalytics) => mockDataRegistry.registerQuestAnalytics(data),
    questSuggestions: (data: QuestSuggestion[]) => mockDataRegistry.registerQuestSuggestions(data),
    skills: (data: Skill[]) => mockDataRegistry.registerSkills(data),
    locationSuggestions: (data: LocationSuggestion[]) => mockDataRegistry.registerLocationSuggestions(data),
    skillSuggestions: (data: SkillSuggestion[]) => mockDataRegistry.registerSkillSuggestions(data),
    unifiedNarrative: (data: UnifiedNarrativeData) => mockDataRegistry.registerUnifiedNarrative(data),
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
    quests: () => mockDataRegistry.getQuests(),
    questBoard: () => mockDataRegistry.getQuestBoard(),
    questAnalytics: () => mockDataRegistry.getQuestAnalytics(),
    questSuggestions: () => mockDataRegistry.getQuestSuggestions(),
    questReflections: (questId: string) => mockDataRegistry.getQuestReflections(questId),
    skills: () => mockDataRegistry.getSkills(),
    locationSuggestions: () => mockDataRegistry.getLocationSuggestions(),
    skillSuggestions: () => mockDataRegistry.getSkillSuggestions(),
    unifiedNarrative: () => mockDataRegistry.getUnifiedNarrative(),
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
      const shouldUseMock = useMock !== undefined ? useMock : getGlobalMockDataEnabled();
      if (shouldUseMock) {
        return {
          data: mock || { goals: [], values: [], alignmentSnapshots: [], driftObservations: [] },
          metadata: createDataMetadata(true, 'mock')
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
      const shouldUseMock = useMock !== undefined ? useMock : getGlobalMockDataEnabled();
      if (shouldUseMock) {
        return {
          data: mock || { total: 0, byType: {} as any, byRarity: {} as any, recent: [] },
          metadata: createDataMetadata(true, 'mock')
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
      const shouldUseMock = useMock !== undefined ? useMock : getGlobalMockDataEnabled();
      if (shouldUseMock) {
        return {
          data: mock || { byTrigger: {}, byLabel: {}, byType: {} as any, intensityAverages: {}, commonPatterns: [] },
          metadata: createDataMetadata(true, 'mock')
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
      const shouldUseMock = useMock !== undefined ? useMock : getGlobalMockDataEnabled();
      if (shouldUseMock) {
        return {
          data: mock || { avg_recovery_time_minutes: null, recovery_trend: 'unknown', recurrence_rate: 0, intensity_trend: 'unknown', resilience_score: null },
          metadata: createDataMetadata(true, 'mock')
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
   * Subscribe to in-memory demo mutations (CRUD) for reactive UI updates.
   */
  subscribe: (listener: () => void) => mockDataRegistry.subscribe(listener),
  getRevision: () => mockDataRegistry.getRevision(),

  /**
   * Demo-mode CRUD — mutates the in-memory registry and emits legacy update events.
   */
  mutate: {
    quests: {
      create: (quest: Quest) => mockDataRegistry.createQuest(quest),
      patch: (questId: string, patch: Partial<Quest>) => mockDataRegistry.patchQuest(questId, patch),
      setStatus: (questId: string, status: QuestStatus, extra?: Partial<Quest>) =>
        mockDataRegistry.setQuestStatus(questId, status, extra),
      remove: (questId: string) => mockDataRegistry.removeQuest(questId),
      addReflection: (questId: string, reflection: string) =>
        mockDataRegistry.addQuestReflection(questId, reflection),
    },
    questSuggestions: {
      remove: (match: { id?: string; title?: string }) => mockDataRegistry.removeQuestSuggestion(match),
    },
    characters: {
      upsert: (character: Character) => mockDataRegistry.upsertCharacter(character),
      remove: (characterId: string) => mockDataRegistry.removeCharacter(characterId),
    },
    goalsValues: {
      ensureSeed: () => mockDataRegistry.ensureGoalsValuesSeed(),
      updateValuePriority: (valueId: string, priority: number) =>
        mockDataRegistry.updateValuePriority(valueId, priority),
    },
    locations: {
      create: (input: { name: string; type?: string | null; context?: string }) =>
        mockDataRegistry.createLocation(input),
      update: (id: string, patch: Partial<LocationProfile>) =>
        mockDataRegistry.updateLocation(id, patch),
      removeSuggestion: (match: { id?: string; name?: string }) =>
        mockDataRegistry.removeLocationSuggestion(match),
    },
    skills: {
      createFromSuggestion: (suggestion: SkillSuggestion) =>
        mockDataRegistry.createSkillFromSuggestion(suggestion),
      removeSuggestion: (match: { id?: string; skill_name?: string }) =>
        mockDataRegistry.removeSkillSuggestion(match),
    },
    memoryProposals: {
      ensureSeed: (proposals: MemoryProposal[]) => mockDataRegistry.ensureMemoryProposalsSeed(proposals),
      approve: (id: string) => mockDataRegistry.resolveMemoryProposal(id, 'APPROVED'),
      reject: (id: string) => mockDataRegistry.resolveMemoryProposal(id, 'REJECTED'),
      edit: (id: string, claimText: string, confidence?: number) =>
        mockDataRegistry.resolveMemoryProposal(id, 'EDITED', {
          claim_text: claimText,
          ...(confidence != null ? { confidence } : {}),
        }),
      defer: (id: string) => mockDataRegistry.resolveMemoryProposal(id, 'DEFERRED'),
    },
  },

  /**
   * Get metadata for current data state
   */
  getMetadata: (isMock: boolean): DataMetadata => createDataMetadata(isMock),

  /**
   * Entity relationship query methods
   */
  relationships: {
    getCharacterRelationships: (characterId: string): CharacterRelationship[] => 
      getCharacterRelationships(characterId),
    getCharacterLocations: (characterId: string): LocationVisit[] => 
      getCharacterLocations(characterId),
    getCharacterSkills: (characterId: string): SkillRelationship[] => 
      getCharacterSkills(characterId),
    getCharacterEvents: (characterId: string) => 
      getCharacterEvents(characterId),
    getCharacterMemories: (characterId: string) => 
      getCharacterMemories(characterId),
    getLocationCharacters: (locationId: string) => 
      getLocationCharacters(locationId),
    getLocationEvents: (locationId: string) => 
      getLocationEvents(locationId),
    getSkillCharacters: (skillId: string) => 
      getSkillCharacters(skillId),
    getSkillEvents: (skillId: string) => 
      getSkillEvents(skillId),
    getEventCharacters: (eventId: string) => 
      getEventCharacters(eventId),
    getEventLocations: (eventId: string) => 
      getEventLocations(eventId),
    getEventSkills: (eventId: string) => 
      getEventSkills(eventId),
    getEventMemories: (eventId: string) => 
      getEventMemories(eventId),
    getMemoryCharacters: (memoryId: string) => 
      getMemoryCharacters(memoryId),
    getMemoryLocations: (memoryId: string) => 
      getMemoryLocations(memoryId),
    getMemorySkills: (memoryId: string) => 
      getMemorySkills(memoryId),
    getMemoryEvents: (memoryId: string) => 
      getMemoryEvents(memoryId),
    getEntityRelationships: (entityType: 'character' | 'location' | 'skill' | 'event' | 'memory', entityId: string) => 
      getEntityRelationships(entityType, entityId),
  },
};


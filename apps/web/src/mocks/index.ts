/**
 * Centralized Mock Data Exports
 * 
 * All mock data for the application is exported from here.
 * This provides a single source of truth for mock data.
 */

// Unified Narrative Data
export { generateUnifiedNarrativeData, ENTITY_IDS, type UnifiedNarrativeData, type NarrativeEvent, type NarrativeLocation, type NarrativeMemory } from './unifiedNarrativeData';

// Character mock data
export { dummyCharacters } from '../components/characters/CharacterBook';

// Location mock data
export { default as mockLocations } from './locations';
export { narrativeLocations } from './locations';

// Memory mock data
export { default as mockMemories } from './memories';
export { narrativeMemories } from './memories';

// Skill mock data
export { narrativeSkills } from './skills';

// Event mock data
export { narrativeEvents } from './events';

// Lorebook mock data
export {
  DEMO_LOREBOOKS,
  DEMO_LOREBOOK_CATALOG,
  DEFAULT_DEMO_LOREBOOK,
  getDemoLorebookById,
  type DemoLorebook,
  type DemoMemoirOutline,
  type DemoLoreChapter,
} from './lorebooks';

// Family mock data
export {
  DEMO_FAMILY_TREE,
  DEMO_FAMILY_HOUSEHOLDS,
  DEMO_FAMILY_GROUPS,
  DEMO_FAMILY_ANALYTICS,
  DEMO_FAMILY_SUMMARY,
  DEMO_FAMILY_CHARACTERS_BY_ID,
  type FamilySummaryMock,
  type FamilyGroupMock,
} from './family';

export { generateMockTimelines, generateMockChronologyEntries } from './timelineMockData';

// Entity Relationship Diagrams
export {
  getCharacterRelationships,
  getCharacterRelationshipGraph,
  getCharacterLocations,
  getLocationCharacters,
  getCharacterSkills,
  getSkillCharacters,
  getCharacterEvents,
  getEventCharacters,
  getLocationEvents,
  getEventLocations,
  getSkillEvents,
  getEventSkills,
  getEventMemories,
  getMemoryEvents,
  getMemoryCharacters,
  getCharacterMemories,
  getMemoryLocations,
  getLocationMemories,
  getMemorySkills,
  getSkillMemories,
  getEntityRelationships,
  type CharacterRelationship,
  type RelationshipGraph,
  type LocationVisit,
  type CharacterVisit,
  type SkillRelationship,
  type CharacterSkill,
  type EntityRelationships,
} from './entityRelationshipDiagrams';

// Stats Validation
export {
  validateStatsMatch,
  validateCharacterStats,
  validateLocationStats,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from './statsValidator';

// Other mock data
export { generateMockRomanticRelationships, getMockRomanticRelationships } from './romanticRelationships';
export {
  ROMANTIC_LORE_SYNOPSIS,
  ROMANTIC_LORE_TEST_CASES,
  ROMANTIC_LORE_CHARACTERS,
} from './romanticLoreStory';
export { MOCK_ROMANTIC_PERIPHERALS, getMockPeripheralsForRelationship } from './romanticPeripherals';
export { MOCK_GOALS_VALUES_DATA } from './goalsValues';
export { MOCK_MEMORY_PROPOSALS } from './memoryProposals';
export { mockContradictions, mockContradictionDetails } from './contradictionData';

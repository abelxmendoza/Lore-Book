/**
 * Centralized Mock Data Exports
 * 
 * All mock data for the application is exported from here.
 * This provides a single source of truth for mock data.
 */

// Unified Narrative Data
export { generateUnifiedNarrativeData, ENTITY_IDS, type UnifiedNarrativeData, type NarrativeEvent, type NarrativeLocation, type NarrativeMemory } from './unifiedNarrativeData';

// Character mock data
export { default as mockCharacters } from './characters';
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

// Timeline mock data (already exists)
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
export { MOCK_GOALS_VALUES_DATA } from './goalsValues';
export { MOCK_MEMORY_PROPOSALS } from './memoryProposals';
export { MOCK_CONTINUITY_EVENTS, MOCK_GOALS, MOCK_CONTRADICTIONS } from './contradictionData';

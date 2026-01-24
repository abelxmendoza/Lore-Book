/**
 * Entity Relationships Test Cases
 * 
 * Tests all entity relationship combinations to ensure data consistency
 * and that all relationships are properly linked.
 */

import { describe, it, expect } from 'vitest';
import { generateUnifiedNarrativeData, ENTITY_IDS } from '../unifiedNarrativeData';
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
} from '../entityRelationshipDiagrams';
import { validateStatsMatch, validateCharacterStats, validateLocationStats } from '../statsValidator';

describe('Entity Relationships', () => {
  const data = generateUnifiedNarrativeData();

  // ============================================================================
  // Character ↔ Character Relationships
  // ============================================================================
  describe('Character ↔ Character', () => {
    it('Alex (boyfriend) has relationship with Sarah', () => {
      const relationships = getCharacterRelationships(ENTITY_IDS.ALEX_BOYFRIEND);
      const sarahRel = relationships.find(r => r.character_id === 'dummy-1'); // Sarah Chen
      expect(sarahRel).toBeDefined();
      expect(sarahRel?.relationship_type).toBe('friend');
    });

    it('Sarah has relationship with Alex (boyfriend)', () => {
      const relationships = getCharacterRelationships('dummy-1'); // Sarah Chen
      const alexRel = relationships.find(r => r.character_id === ENTITY_IDS.ALEX_BOYFRIEND);
      expect(alexRel).toBeDefined();
      expect(alexRel?.relationship_type).toBe('friend');
    });

    it('Alex Rivera has relationship with Marcus', () => {
      const relationships = getCharacterRelationships('dummy-3'); // Alex Rivera
      const marcusRel = relationships.find(r => r.character_id === 'dummy-2'); // Marcus
      expect(marcusRel).toBeDefined();
      expect(marcusRel?.relationship_type).toBe('friend');
    });

    it('Marcus has relationship with Alex Rivera', () => {
      const relationships = getCharacterRelationships('dummy-2'); // Marcus
      const alexRiveraRel = relationships.find(r => r.character_id === 'dummy-3'); // Alex Rivera
      expect(alexRiveraRel).toBeDefined();
    });
  });

  // ============================================================================
  // Character ↔ Location Relationships
  // ============================================================================
  describe('Character ↔ Location', () => {
    it('Sarah has 24 visits to Coffee Shop', () => {
      const locations = getCharacterLocations('dummy-1'); // Sarah Chen
      const coffeeShop = locations.find(l => l.location_id === ENTITY_IDS.COFFEE_SHOP);
      expect(coffeeShop).toBeDefined();
      expect(coffeeShop?.visit_count).toBe(24);
    });

    it('Alex Rivera has 45 visits to Home Studio', () => {
      const locations = getCharacterLocations('dummy-3'); // Alex Rivera
      const homeStudio = locations.find(l => l.location_id === ENTITY_IDS.HOME_STUDIO);
      expect(homeStudio).toBeDefined();
      expect(homeStudio?.visit_count).toBe(45);
    });

    it('Alex (boyfriend) has 18 visits to Home Studio', () => {
      const locations = getCharacterLocations(ENTITY_IDS.ALEX_BOYFRIEND);
      const homeStudio = locations.find(l => l.location_id === ENTITY_IDS.HOME_STUDIO);
      expect(homeStudio).toBeDefined();
      expect(homeStudio?.visit_count).toBe(18);
    });

    it('Coffee Shop has Sarah as a visitor with 24 visits', () => {
      const characters = getLocationCharacters(ENTITY_IDS.COFFEE_SHOP);
      const sarah = characters.find(c => c.character_id === ENTITY_IDS.SARAH_CHEN);
      expect(sarah).toBeDefined();
      expect(sarah?.visit_count).toBe(24);
    });

    it('Home Studio has Alex Rivera as a visitor with 45 visits', () => {
      const characters = getLocationCharacters(ENTITY_IDS.HOME_STUDIO);
      const alexRivera = characters.find(c => c.character_id === ENTITY_IDS.ALEX_RIVERA);
      expect(alexRivera).toBeDefined();
      expect(alexRivera?.visit_count).toBe(45);
    });

    it('Home Studio visit count matches sum of character visits', () => {
      const characters = getLocationCharacters(ENTITY_IDS.HOME_STUDIO);
      const totalVisits = characters.reduce((sum, c) => sum + c.visit_count, 0);
      const location = data.locations.find(l => l.id === ENTITY_IDS.HOME_STUDIO);
      expect(totalVisits).toBe(location?.visitCount);
    });
  });

  // ============================================================================
  // Character ↔ Skill Relationships
  // ============================================================================
  describe('Character ↔ Skill', () => {
    it('Alex Rivera teaches Music Production', () => {
      const skills = getCharacterSkills('dummy-3'); // Alex Rivera
      const musicProd = skills.find(s => s.skill_id === ENTITY_IDS.MUSIC_PRODUCTION);
      expect(musicProd).toBeDefined();
      expect(musicProd?.role).toBe('teacher');
    });

    it('Music Production is learned from Alex Rivera', () => {
      const characters = getSkillCharacters(ENTITY_IDS.MUSIC_PRODUCTION);
      const alexRivera = characters.find(c => c.character_id === ENTITY_IDS.ALEX_RIVERA);
      expect(alexRivera).toBeDefined();
      expect(alexRivera?.role).toBe('teacher');
    });

    it('Sarah practices Creative Writing with user', () => {
      const skills = getCharacterSkills('dummy-1'); // Sarah Chen
      const creativeWriting = skills.find(s => s.skill_id === ENTITY_IDS.CREATIVE_WRITING);
      expect(creativeWriting).toBeDefined();
      expect(creativeWriting?.role).toBe('practiced_with');
    });

    it('Creative Writing is practiced with Sarah', () => {
      const characters = getSkillCharacters(ENTITY_IDS.CREATIVE_WRITING);
      const sarah = characters.find(c => c.character_id === ENTITY_IDS.SARAH_CHEN);
      expect(sarah).toBeDefined();
      expect(sarah?.role).toBe('practiced_with');
    });
  });

  // ============================================================================
  // Character ↔ Event Relationships
  // ============================================================================
  describe('Character ↔ Event', () => {
    it('Alex (boyfriend) is in First Date event', () => {
      const events = getCharacterEvents(ENTITY_IDS.ALEX_BOYFRIEND);
      const firstDate = events.find(e => e.id === ENTITY_IDS.FIRST_DATE_ALEX);
      expect(firstDate).toBeDefined();
    });

    it('First Date event has Alex (boyfriend) as character', () => {
      const characters = getEventCharacters(ENTITY_IDS.FIRST_DATE_ALEX);
      const alex = characters.find(c => c.id === ENTITY_IDS.ALEX_BOYFRIEND);
      expect(alex).toBeDefined();
    });

    it('Alex Rivera is in EP Concept Session', () => {
      const events = getCharacterEvents('dummy-3'); // Alex Rivera
      const epConcept = events.find(e => e.id === ENTITY_IDS.EP_CONCEPT_SESSION);
      expect(epConcept).toBeDefined();
    });

    it('EP Concept Session has Alex Rivera as character', () => {
      const characters = getEventCharacters(ENTITY_IDS.EP_CONCEPT_SESSION);
      const alexRivera = characters.find(c => c.id === ENTITY_IDS.ALEX_RIVERA);
      expect(alexRivera).toBeDefined();
    });

    it('Sarah is in First Writing Session event', () => {
      const events = getCharacterEvents('dummy-1'); // Sarah Chen
      const writingSession = events.find(e => e.id === ENTITY_IDS.FIRST_WRITING_SESSION);
      expect(writingSession).toBeDefined();
    });
  });

  // ============================================================================
  // Location ↔ Event Relationships
  // ============================================================================
  describe('Location ↔ Event', () => {
    it('Home Studio has EP Concept Session event', () => {
      const events = getLocationEvents(ENTITY_IDS.HOME_STUDIO);
      const epConcept = events.find(e => e.id === ENTITY_IDS.EP_CONCEPT_SESSION);
      expect(epConcept).toBeDefined();
    });

    it('EP Concept Session is at Home Studio', () => {
      const locations = getEventLocations(ENTITY_IDS.EP_CONCEPT_SESSION);
      const homeStudio = locations.find(l => l.id === ENTITY_IDS.HOME_STUDIO);
      expect(homeStudio).toBeDefined();
    });

    it('Coffee Shop has First Date event', () => {
      const events = getLocationEvents(ENTITY_IDS.COFFEE_SHOP);
      const firstDate = events.find(e => e.id === ENTITY_IDS.FIRST_DATE_ALEX);
      expect(firstDate).toBeDefined();
    });

    it('First Date is at Coffee Shop', () => {
      const locations = getEventLocations(ENTITY_IDS.FIRST_DATE_ALEX);
      const coffeeShop = locations.find(l => l.id === ENTITY_IDS.COFFEE_SHOP);
      expect(coffeeShop).toBeDefined();
    });

    it('Central Park has First Kiss event', () => {
      const events = getLocationEvents(ENTITY_IDS.CENTRAL_PARK);
      const firstKiss = events.find(e => e.id === ENTITY_IDS.FIRST_KISS_ALEX);
      expect(firstKiss).toBeDefined();
    });
  });

  // ============================================================================
  // Skill ↔ Event Relationships
  // ============================================================================
  describe('Skill ↔ Event', () => {
    it('Music Production is used in EP Concept Session', () => {
      const events = getSkillEvents(ENTITY_IDS.MUSIC_PRODUCTION);
      const epConcept = events.find(e => e.id === ENTITY_IDS.EP_CONCEPT_SESSION);
      expect(epConcept).toBeDefined();
    });

    it('EP Concept Session uses Music Production skill', () => {
      const skills = getEventSkills(ENTITY_IDS.EP_CONCEPT_SESSION);
      const musicProd = skills.find(s => s.id === ENTITY_IDS.MUSIC_PRODUCTION);
      expect(musicProd).toBeDefined();
    });

    it('Creative Writing is used in First Writing Session', () => {
      const events = getSkillEvents(ENTITY_IDS.CREATIVE_WRITING);
      const writingSession = events.find(e => e.id === ENTITY_IDS.FIRST_WRITING_SESSION);
      expect(writingSession).toBeDefined();
    });

    it('First Track Completed uses Music Production and Audio Engineering', () => {
      const skills = getEventSkills(ENTITY_IDS.FIRST_TRACK_COMPLETED);
      const musicProd = skills.find(s => s.id === ENTITY_IDS.MUSIC_PRODUCTION);
      const audioEng = skills.find(s => s.id === ENTITY_IDS.AUDIO_ENGINEERING);
      expect(musicProd).toBeDefined();
      expect(audioEng).toBeDefined();
    });
  });

  // ============================================================================
  // Event ↔ Memory Relationships
  // ============================================================================
  describe('Event ↔ Memory', () => {
    it('EP Concept Session has 4 memories', () => {
      const memories = getEventMemories(ENTITY_IDS.EP_CONCEPT_SESSION);
      expect(memories.length).toBe(4);
    });

    it('First Date has 4 memories', () => {
      const memories = getEventMemories(ENTITY_IDS.FIRST_DATE_ALEX);
      expect(memories.length).toBe(4);
    });

    it('EP Concept Session memories link back to event', () => {
      const memories = getEventMemories(ENTITY_IDS.EP_CONCEPT_SESSION);
      for (const memory of memories) {
        const events = getMemoryEvents(memory.id);
        const epConcept = events.find(e => e.id === ENTITY_IDS.EP_CONCEPT_SESSION);
        expect(epConcept).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Memory ↔ Character Relationships
  // ============================================================================
  describe('Memory ↔ Character', () => {
    it('EP Concept memories have Alex Rivera as character', () => {
      const memories = getEventMemories(ENTITY_IDS.EP_CONCEPT_SESSION);
      for (const memory of memories) {
        const characters = getMemoryCharacters(memory.id);
        const alexRivera = characters.find(c => c.id === 'dummy-3'); // Alex Rivera
        expect(alexRivera).toBeDefined();
      }
    });

    it('First Date memories have Alex (boyfriend) as character', () => {
      const memories = getEventMemories(ENTITY_IDS.FIRST_DATE_ALEX);
      for (const memory of memories) {
        const characters = getMemoryCharacters(memory.id);
        const alex = characters.find(c => c.id === ENTITY_IDS.ALEX_BOYFRIEND);
        expect(alex).toBeDefined();
      }
    });

    it('Alex (boyfriend) appears in 32 memories', () => {
      const memories = getCharacterMemories(ENTITY_IDS.ALEX_BOYFRIEND);
      expect(memories.length).toBeGreaterThanOrEqual(32);
    });

    it('Alex Rivera appears in 45 memories', () => {
      const memories = getCharacterMemories('dummy-3'); // Alex Rivera
      expect(memories.length).toBeGreaterThanOrEqual(45);
    });
  });

  // ============================================================================
  // Memory ↔ Location Relationships
  // ============================================================================
  describe('Memory ↔ Location', () => {
    it('EP Concept memories are at Home Studio', () => {
      const memories = getEventMemories(ENTITY_IDS.EP_CONCEPT_SESSION);
      for (const memory of memories) {
        const locations = getMemoryLocations(memory.id);
        const homeStudio = locations.find(l => l.id === ENTITY_IDS.HOME_STUDIO);
        expect(homeStudio).toBeDefined();
      }
    });

    it('First Date memories are at Coffee Shop', () => {
      const memories = getEventMemories(ENTITY_IDS.FIRST_DATE_ALEX);
      for (const memory of memories) {
        const locations = getMemoryLocations(memory.id);
        const coffeeShop = locations.find(l => l.id === ENTITY_IDS.COFFEE_SHOP);
        expect(coffeeShop).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Memory ↔ Skill Relationships
  // ============================================================================
  describe('Memory ↔ Skill', () => {
    it('EP Concept memories link to Music Production skill', () => {
      const memories = getEventMemories(ENTITY_IDS.EP_CONCEPT_SESSION);
      for (const memory of memories) {
        const skills = getMemorySkills(memory.id);
        const musicProd = skills.find(s => s.id === ENTITY_IDS.MUSIC_PRODUCTION);
        expect(musicProd).toBeDefined();
      }
    });

    it('First Writing Session memories link to Creative Writing skill', () => {
      const memories = getEventMemories(ENTITY_IDS.FIRST_WRITING_SESSION);
      for (const memory of memories) {
        const skills = getMemorySkills(memory.id);
        const creativeWriting = skills.find(s => s.id === ENTITY_IDS.CREATIVE_WRITING);
        expect(creativeWriting).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Stats Validation
  // ============================================================================
  describe('Stats Validation', () => {
    it('Character memory_count matches actual memories', () => {
      const result = validateStatsMatch(data);
      const memoryCountErrors = result.errors.filter(e => e.type === 'memory_count_mismatch');
      expect(memoryCountErrors.length).toBe(0);
    });

    it('Location visit_count matches sum of character visits', () => {
      const result = validateStatsMatch(data);
      const visitCountErrors = result.errors.filter(e => e.type === 'visit_count_mismatch');
      expect(visitCountErrors.length).toBe(0);
    });

    it('Alex (boyfriend) memory_count is valid', () => {
      const result = validateCharacterStats(ENTITY_IDS.ALEX_BOYFRIEND, data);
      expect(result.valid).toBe(true);
    });

    it('Alex Rivera memory_count is valid', () => {
      const result = validateCharacterStats('dummy-3', data); // Alex Rivera
      expect(result.valid).toBe(true);
    });

    it('Sarah memory_count is valid', () => {
      const result = validateCharacterStats('dummy-1', data); // Sarah Chen
      expect(result.valid).toBe(true);
    });

    it('Home Studio visit_count is valid', () => {
      const result = validateLocationStats(ENTITY_IDS.HOME_STUDIO, data);
      expect(result.valid).toBe(true);
    });

    it('Coffee Shop visit_count is valid', () => {
      const result = validateLocationStats(ENTITY_IDS.COFFEE_SHOP, data);
      expect(result.valid).toBe(true);
    });

    it('All events have valid character references', () => {
      const result = validateStatsMatch(data);
      const missingCharErrors = result.errors.filter(e => e.type === 'missing_character');
      expect(missingCharErrors.length).toBe(0);
    });

    it('All events have valid location references', () => {
      const result = validateStatsMatch(data);
      const missingLocErrors = result.errors.filter(e => e.type === 'missing_location');
      expect(missingLocErrors.length).toBe(0);
    });

    it('All memories have valid character references', () => {
      const result = validateStatsMatch(data);
      const missingCharErrors = result.errors.filter(e => 
        e.type === 'missing_character' && e.entity_type === 'memory'
      );
      expect(missingCharErrors.length).toBe(0);
    });

    it('All memories have valid location references', () => {
      const result = validateStatsMatch(data);
      const missingLocErrors = result.errors.filter(e => 
        e.type === 'missing_location' && e.entity_type === 'memory'
      );
      expect(missingLocErrors.length).toBe(0);
    });

    it('All memories have valid skill references', () => {
      const result = validateStatsMatch(data);
      const missingSkillErrors = result.errors.filter(e => 
        e.type === 'missing_skill' && e.entity_type === 'memory'
      );
      expect(missingSkillErrors.length).toBe(0);
    });

    it('All event-memory links are bidirectional', () => {
      const result = validateStatsMatch(data);
      const memoryEventErrors = result.errors.filter(e => 
        e.type === 'memory_not_linked_to_event'
      );
      expect(memoryEventErrors.length).toBe(0);
    });
  });

  // ============================================================================
  // Comprehensive Relationship Tests
  // ============================================================================
  describe('Comprehensive Relationships', () => {
    it('EP Concept Session has all required entities linked', () => {
      const event = data.events.find(e => e.id === ENTITY_IDS.EP_CONCEPT_SESSION);
      expect(event).toBeDefined();
      expect(event?.characters.length).toBeGreaterThan(0);
      expect(event?.locations.length).toBeGreaterThan(0);
      expect(event?.skills.length).toBeGreaterThan(0);
      expect(event?.memories.length).toBe(4);
    });

    it('First Date has all required entities linked', () => {
      const event = data.events.find(e => e.id === ENTITY_IDS.FIRST_DATE_ALEX);
      expect(event).toBeDefined();
      expect(event?.characters.length).toBeGreaterThan(0);
      expect(event?.locations.length).toBeGreaterThan(0);
      expect(event?.memories.length).toBe(4);
    });

    it('Home Studio has all associated entities', () => {
      const location = data.locations.find(l => l.id === ENTITY_IDS.HOME_STUDIO);
      expect(location).toBeDefined();
      expect(location?.associated_characters.length).toBeGreaterThan(0);
      expect(location?.associated_skills.length).toBeGreaterThan(0);
      expect(location?.associated_events.length).toBeGreaterThan(0);
    });

    it('Music Production skill has all associated entities', () => {
      const skill = data.skills.find(s => s.id === ENTITY_IDS.MUSIC_PRODUCTION);
      expect(skill).toBeDefined();
      expect(skill?.metadata?.skill_details?.learned_from?.length).toBeGreaterThan(0);
      expect(skill?.metadata?.skill_details?.practiced_at?.length).toBeGreaterThan(0);
    });
  });
});

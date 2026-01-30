/**
 * Entity Relationship Diagram Functions
 * 
 * Functions to query and visualize relationships between entities
 * (characters, locations, skills, events, memories).
 */

import { generateUnifiedNarrativeData, type UnifiedNarrativeData } from './unifiedNarrativeData';
import { ENTITY_IDS } from './unifiedNarrativeData';
import { mockDataService } from '../services/mockDataService';

// Cache the unified data
let cachedData: UnifiedNarrativeData | null = null;

/** Reset cache for tests so they can inject their own unified narrative. */
export function _clearUnifiedDataCacheForTesting(): void {
  cachedData = null;
}

function getUnifiedData(): UnifiedNarrativeData {
  if (!cachedData) {
    // Try to get from mock data service first
    const serviceData = mockDataService.get.unifiedNarrative();
    if (serviceData) {
      cachedData = serviceData;
    } else {
      // Generate if not registered
      cachedData = generateUnifiedNarrativeData();
      // Register it for future use
      mockDataService.register.unifiedNarrative(cachedData);
    }
  }
  return cachedData;
}

// ============================================================================
// Character-Character Relationships
// ============================================================================

export interface CharacterRelationship {
  character_id: string;
  character_name: string;
  relationship_type: string;
  closeness: number;
  bidirectional: boolean;
}

export function getCharacterRelationships(characterId: string): CharacterRelationship[] {
  const data = getUnifiedData();
  const relationships: CharacterRelationship[] = [];
  
  // Get relationships from character metadata
  const character = data.characters.find(c => c.id === characterId);
  if (character?.metadata?.relationships) {
    for (const [otherId, rel] of Object.entries(character.metadata.relationships)) {
      const otherChar = data.characters.find(c => c.id === otherId);
      if (otherChar) {
        relationships.push({
          character_id: otherId,
          character_name: otherChar.name,
          relationship_type: rel.type,
          closeness: rel.closeness,
          bidirectional: false, // Check if bidirectional
        });
      }
    }
  }
  
  // Check for bidirectional relationships
  for (const rel of relationships) {
    const otherChar = data.characters.find(c => c.id === rel.character_id);
    if (otherChar?.metadata?.relationships?.[characterId]) {
      rel.bidirectional = true;
    }
  }
  
  return relationships;
}

export interface RelationshipGraph {
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ source: string; target: string; type: string; closeness: number }>;
}

export function getCharacterRelationshipGraph(): RelationshipGraph {
  const data = getUnifiedData();
  const nodes: RelationshipGraph['nodes'] = [];
  const edges: RelationshipGraph['edges'] = [];
  const nodeSet = new Set<string>();
  
  for (const char of data.characters) {
    if (!nodeSet.has(char.id)) {
      nodes.push({ id: char.id, name: char.name, type: 'character' });
      nodeSet.add(char.id);
    }
    
    if (char.metadata?.relationships) {
      for (const [otherId, rel] of Object.entries(char.metadata.relationships)) {
        const otherChar = data.characters.find(c => c.id === otherId);
        if (otherChar && !nodeSet.has(otherId)) {
          nodes.push({ id: otherId, name: otherChar.name, type: 'character' });
          nodeSet.add(otherId);
        }
        
        edges.push({
          source: char.id,
          target: otherId,
          type: rel.type,
          closeness: rel.closeness,
        });
      }
    }
  }
  
  return { nodes, edges };
}

// ============================================================================
// Character-Location Relationships
// ============================================================================

export interface LocationVisit {
  location_id: string;
  location_name: string;
  visit_count: number;
  first_visit: string;
  last_visit: string;
}

export function getCharacterLocations(characterId: string): LocationVisit[] {
  const data = getUnifiedData();
  const visits: LocationVisit[] = [];
  
  const character = data.characters.find(c => c.id === characterId);
  if (character?.metadata?.locations) {
    for (const [locId, visit] of Object.entries(character.metadata.locations)) {
      const location = data.locations.find(l => l.id === locId);
      if (location) {
        visits.push({
          location_id: locId,
          location_name: location.name,
          visit_count: visit.visit_count,
          first_visit: visit.first_visit,
          last_visit: visit.last_visit,
        });
      }
    }
  }
  
  return visits;
}

export interface CharacterVisit {
  character_id: string;
  character_name: string;
  visit_count: number;
  first_visit: string;
  last_visit: string;
}

export function getLocationCharacters(locationId: string): CharacterVisit[] {
  const data = getUnifiedData();
  const location = data.locations.find(l => l.id === locationId);
  
  if (!location) return [];
  
  return location.associated_characters.map(assoc => {
    const character = data.characters.find(c => c.id === assoc.character_id);
    return {
      character_id: assoc.character_id,
      character_name: character?.name || 'Unknown',
      visit_count: assoc.visit_count,
      first_visit: '', // Would need to be calculated from character metadata
      last_visit: '', // Would need to be calculated from character metadata
    };
  });
}

// ============================================================================
// Character-Skill Relationships
// ============================================================================

export interface SkillRelationship {
  skill_id: string;
  skill_name: string;
  role: string; // 'teacher', 'student', 'practiced_with', 'learned_from'
  level_contribution?: number;
}

export function getCharacterSkills(characterId: string): SkillRelationship[] {
  const data = getUnifiedData();
  const skills: SkillRelationship[] = [];
  
  const character = data.characters.find(c => c.id === characterId);
  if (character?.metadata?.skills) {
    for (const [skillId, skillRel] of Object.entries(character.metadata.skills)) {
      const skill = data.skills.find(s => s.id === skillId);
      if (skill) {
        skills.push({
          skill_id: skillId,
          skill_name: skill.skill_name,
          role: skillRel.role,
          level_contribution: skillRel.level_contribution,
        });
      }
    }
  }
  
  return skills;
}

export interface CharacterSkill {
  character_id: string;
  character_name: string;
  role: string;
  level_contribution?: number;
}

export function getSkillCharacters(skillId: string): CharacterSkill[] {
  const data = getUnifiedData();
  const characters: CharacterSkill[] = [];
  
  const skill = data.skills.find(s => s.id === skillId);
  if (!skill) return [];
  
  // Check learned_from
  if (skill.metadata?.skill_details?.learned_from) {
    for (const teacher of skill.metadata.skill_details.learned_from) {
      characters.push({
        character_id: teacher.character_id,
        character_name: teacher.character_name,
        role: 'teacher',
        level_contribution: undefined,
      });
    }
  }
  
  // Check practiced_with
  if (skill.metadata?.skill_details?.practiced_with) {
    for (const partner of skill.metadata.skill_details.practiced_with) {
      characters.push({
        character_id: partner.character_id,
        character_name: partner.character_name,
        role: 'practiced_with',
        level_contribution: undefined,
      });
    }
  }
  
  return characters;
}

// ============================================================================
// Character-Event Relationships
// ============================================================================

export function getCharacterEvents(characterId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const events: Array<{ id: string; title: string; date: string }> = [];
  
  const eventSet = data.relationships.characterEvent.get(characterId);
  if (eventSet) {
    for (const eventId of eventSet) {
      const event = data.events.find(e => e.id === eventId);
      if (event) {
        events.push({
          id: event.id,
          title: event.title,
          date: event.start_time,
        });
      }
    }
  }
  
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getEventCharacters(eventId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const event = data.events.find(e => e.id === eventId);
  
  if (!event) return [];
  
  return event.characters.map(charId => {
    const character = data.characters.find(c => c.id === charId);
    return {
      id: charId,
      name: character?.name || 'Unknown',
    };
  });
}

// ============================================================================
// Location-Event Relationships
// ============================================================================

export function getLocationEvents(locationId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const events: Array<{ id: string; title: string; date: string }> = [];
  
  const eventSet = data.relationships.locationEvent.get(locationId);
  if (eventSet) {
    for (const eventId of eventSet) {
      const event = data.events.find(e => e.id === eventId);
      if (event) {
        events.push({
          id: event.id,
          title: event.title,
          date: event.start_time,
        });
      }
    }
  }
  
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getEventLocations(eventId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const event = data.events.find(e => e.id === eventId);
  
  if (!event) return [];
  
  return event.locations.map(locId => {
    const location = data.locations.find(l => l.id === locId);
    return {
      id: locId,
      name: location?.name || 'Unknown',
    };
  });
}

// ============================================================================
// Skill-Event Relationships
// ============================================================================

export function getSkillEvents(skillId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const events: Array<{ id: string; title: string; date: string }> = [];
  
  const eventSet = data.relationships.skillEvent.get(skillId);
  if (eventSet) {
    for (const eventId of eventSet) {
      const event = data.events.find(e => e.id === eventId);
      if (event) {
        events.push({
          id: event.id,
          title: event.title,
          date: event.start_time,
        });
      }
    }
  }
  
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getEventSkills(eventId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const event = data.events.find(e => e.id === eventId);
  
  if (!event) return [];
  
  return event.skills.map(skillId => {
    const skill = data.skills.find(s => s.id === skillId);
    return {
      id: skillId,
      name: skill?.skill_name || 'Unknown',
    };
  });
}

// ============================================================================
// Event-Memory Relationships
// ============================================================================

export function getEventMemories(eventId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const memories: Array<{ id: string; title: string; date: string }> = [];
  
  const memorySet = data.relationships.eventMemory.get(eventId);
  if (memorySet) {
    for (const memoryId of memorySet) {
      const memory = data.memories.find(m => m.id === memoryId);
      if (memory) {
        memories.push({
          id: memory.id,
          title: memory.title,
          date: memory.date,
        });
      }
    }
  }
  
  return memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMemoryEvents(memoryId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const memory = data.memories.find(m => m.id === memoryId);
  
  if (!memory) return [];
  
  return memory.linked_events.map(eventId => {
    const event = data.events.find(e => e.id === eventId);
    return {
      id: eventId,
      title: event?.title || 'Unknown',
      date: event?.start_time || '',
    };
  });
}

// ============================================================================
// Memory-Character Relationships
// ============================================================================

export function getMemoryCharacters(memoryId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const memory = data.memories.find(m => m.id === memoryId);
  
  if (!memory) return [];
  
  return memory.linked_characters.map(charId => {
    const character = data.characters.find(c => c.id === charId);
    return {
      id: charId,
      name: character?.name || 'Unknown',
    };
  });
}

export function getCharacterMemories(characterId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const memories: Array<{ id: string; title: string; date: string }> = [];
  
  for (const memory of data.memories) {
    if (memory.linked_characters.includes(characterId)) {
      memories.push({
        id: memory.id,
        title: memory.title,
        date: memory.date,
      });
    }
  }
  
  return memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ============================================================================
// Memory-Location Relationships
// ============================================================================

export function getMemoryLocations(memoryId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const memory = data.memories.find(m => m.id === memoryId);
  
  if (!memory) return [];
  
  return memory.linked_locations.map(locId => {
    const location = data.locations.find(l => l.id === locId);
    return {
      id: locId,
      name: location?.name || 'Unknown',
    };
  });
}

export function getLocationMemories(locationId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const memories: Array<{ id: string; title: string; date: string }> = [];
  
  for (const memory of data.memories) {
    if (memory.linked_locations.includes(locationId)) {
      memories.push({
        id: memory.id,
        title: memory.title,
        date: memory.date,
      });
    }
  }
  
  return memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ============================================================================
// Memory-Skill Relationships
// ============================================================================

export function getMemorySkills(memoryId: string): Array<{ id: string; name: string }> {
  const data = getUnifiedData();
  const memory = data.memories.find(m => m.id === memoryId);
  
  if (!memory) return [];
  
  return memory.linked_skills.map(skillId => {
    const skill = data.skills.find(s => s.id === skillId);
    return {
      id: skillId,
      name: skill?.skill_name || 'Unknown',
    };
  });
}

export function getSkillMemories(skillId: string): Array<{ id: string; title: string; date: string }> {
  const data = getUnifiedData();
  const memories: Array<{ id: string; title: string; date: string }> = [];
  
  for (const memory of data.memories) {
    if (memory.linked_skills.includes(skillId)) {
      memories.push({
        id: memory.id,
        title: memory.title,
        date: memory.date,
      });
    }
  }
  
  return memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ============================================================================
// Comprehensive Relationship Queries
// ============================================================================

export interface EntityRelationships {
  characters: CharacterRelationship[];
  locations: LocationVisit[];
  skills: SkillRelationship[];
  events: Array<{ id: string; title: string; date: string }>;
  memories: Array<{ id: string; title: string; date: string }>;
}

export function getEntityRelationships(entityType: 'character' | 'location' | 'skill' | 'event' | 'memory', entityId: string): Partial<EntityRelationships> {
  switch (entityType) {
    case 'character':
      return {
        characters: getCharacterRelationships(entityId),
        locations: getCharacterLocations(entityId),
        skills: getCharacterSkills(entityId),
        events: getCharacterEvents(entityId),
        memories: getCharacterMemories(entityId),
      };
    case 'location':
      return {
        characters: getLocationCharacters(entityId).map(cv => ({
          character_id: cv.character_id,
          character_name: cv.character_name,
          relationship_type: 'visitor',
          closeness: 0,
          bidirectional: false,
        })),
        events: getLocationEvents(entityId),
        memories: getLocationMemories(entityId),
      };
    case 'skill':
      return {
        characters: getSkillCharacters(entityId).map(cs => ({
          character_id: cs.character_id,
          character_name: cs.character_name,
          relationship_type: cs.role,
          closeness: 0,
          bidirectional: false,
        })),
        events: getSkillEvents(entityId),
        memories: getSkillMemories(entityId),
      };
    case 'event':
      return {
        characters: getEventCharacters(entityId).map(ec => ({
          character_id: ec.id,
          character_name: ec.name,
          relationship_type: 'participant',
          closeness: 0,
          bidirectional: false,
        })),
        locations: getEventLocations(entityId).map(el => ({
          location_id: el.id,
          location_name: el.name,
          visit_count: 1,
          first_visit: '',
          last_visit: '',
        })),
        skills: getEventSkills(entityId).map(es => ({
          skill_id: es.id,
          skill_name: es.name,
          role: 'applied_in',
          level_contribution: undefined,
        })),
        memories: getEventMemories(entityId),
      };
    case 'memory':
      return {
        characters: getMemoryCharacters(entityId).map(mc => ({
          character_id: mc.id,
          character_name: mc.name,
          relationship_type: 'mentioned_in',
          closeness: 0,
          bidirectional: false,
        })),
        locations: getMemoryLocations(entityId).map(ml => ({
          location_id: ml.id,
          location_name: ml.name,
          visit_count: 1,
          first_visit: '',
          last_visit: '',
        })),
        skills: getMemorySkills(entityId).map(ms => ({
          skill_id: ms.id,
          skill_name: ms.name,
          role: 'mentioned_in',
          level_contribution: undefined,
        })),
        events: getMemoryEvents(entityId),
      };
    default:
      return {};
  }
}

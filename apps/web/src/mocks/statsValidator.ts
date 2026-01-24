/**
 * Stats Validation System
 * 
 * Validates that all stats match across entity relationships.
 * Ensures data consistency in the unified narrative.
 */

import { generateUnifiedNarrativeData, type UnifiedNarrativeData } from './unifiedNarrativeData';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: string;
  entity_type: string;
  entity_id: string;
  field: string;
  expected: any;
  actual: any;
  message: string;
}

export interface ValidationWarning {
  type: string;
  entity_type: string;
  entity_id: string;
  message: string;
}

export function validateStatsMatch(data?: UnifiedNarrativeData): ValidationResult {
  const unifiedData = data || generateUnifiedNarrativeData();
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ============================================================================
  // Validate Character Memory Counts
  // ============================================================================
  for (const character of unifiedData.characters) {
    const actualMemoryCount = unifiedData.memories.filter(m => 
      m.linked_characters.includes(character.id)
    ).length;
    
    if (character.memory_count !== actualMemoryCount) {
      errors.push({
        type: 'memory_count_mismatch',
        entity_type: 'character',
        entity_id: character.id,
        field: 'memory_count',
        expected: actualMemoryCount,
        actual: character.memory_count,
        message: `Character ${character.name} has memory_count=${character.memory_count} but actually appears in ${actualMemoryCount} memories`,
      });
    }
  }

  // ============================================================================
  // Validate Location Visit Counts
  // ============================================================================
  for (const location of unifiedData.locations) {
    // Calculate total visits from character metadata
    let calculatedVisitCount = 0;
    for (const assoc of location.associated_characters) {
      calculatedVisitCount += assoc.visit_count;
    }
    
    if (location.visitCount !== calculatedVisitCount) {
      errors.push({
        type: 'visit_count_mismatch',
        entity_type: 'location',
        entity_id: location.id,
        field: 'visitCount',
        expected: calculatedVisitCount,
        actual: location.visitCount,
        message: `Location ${location.name} has visitCount=${location.visitCount} but sum of character visits=${calculatedVisitCount}`,
      });
    }
  }

  // ============================================================================
  // Validate Character Location Visits
  // ============================================================================
  for (const character of unifiedData.characters) {
    if (character.metadata?.locations) {
      for (const [locId, visit] of Object.entries(character.metadata.locations)) {
        const location = unifiedData.locations.find(l => l.id === locId);
        if (location) {
          const assoc = location.associated_characters.find(a => a.character_id === character.id);
          if (!assoc) {
            errors.push({
              type: 'character_location_missing',
              entity_type: 'character',
              entity_id: character.id,
              field: 'locations',
              expected: `Location ${location.name} should have character ${character.name} in associated_characters`,
              actual: 'missing',
              message: `Character ${character.name} has visits to ${location.name} but location doesn't list this character`,
            });
          } else if (assoc.visit_count !== visit.visit_count) {
            errors.push({
              type: 'visit_count_mismatch',
              entity_type: 'character_location',
              entity_id: `${character.id}-${locId}`,
              field: 'visit_count',
              expected: visit.visit_count,
              actual: assoc.visit_count,
              message: `Character ${character.name} and Location ${location.name} have mismatched visit counts`,
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // Validate Skill Practice Counts
  // ============================================================================
  for (const skill of unifiedData.skills) {
    // Count events where skill was applied
    const eventCount = unifiedData.events.filter(e => 
      e.skills.includes(skill.id)
    ).length;
    
    // Count memories where skill was mentioned
    const memoryCount = unifiedData.memories.filter(m => 
      m.linked_skills.includes(skill.id)
    ).length;
    
    // Practice count should roughly match events + locations
    const locationCount = skill.metadata?.skill_details?.practiced_at?.reduce(
      (sum, loc) => sum + loc.practice_count, 0
    ) || 0;
    
    const expectedPracticeCount = Math.max(eventCount, locationCount);
    
    if (skill.practice_count < expectedPracticeCount) {
      warnings.push({
        type: 'practice_count_low',
        entity_type: 'skill',
        entity_id: skill.id,
        message: `Skill ${skill.skill_name} has practice_count=${skill.practice_count} but appears in ${eventCount} events and ${locationCount} location practices`,
      });
    }
  }

  // ============================================================================
  // Validate Event Character Counts
  // ============================================================================
  for (const event of unifiedData.events) {
    // Verify all characters in event exist
    for (const charId of event.characters) {
      const character = unifiedData.characters.find(c => c.id === charId);
      if (!character) {
        errors.push({
          type: 'missing_character',
          entity_type: 'event',
          entity_id: event.id,
          field: 'characters',
          expected: `Character ${charId} should exist`,
          actual: 'not found',
          message: `Event ${event.title} references character ${charId} that doesn't exist`,
        });
      }
    }
    
    // Verify event is in character's event list
    for (const charId of event.characters) {
      const charEvents = unifiedData.relationships.characterEvent.get(charId);
      if (!charEvents || !charEvents.has(event.id)) {
        errors.push({
          type: 'event_not_in_character_events',
          entity_type: 'event',
          entity_id: event.id,
          field: 'character_events',
          expected: `Event ${event.id} should be in character ${charId}'s events`,
          actual: 'missing',
          message: `Event ${event.title} has character ${charId} but character's event list doesn't include this event`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Event Location Counts
  // ============================================================================
  for (const event of unifiedData.events) {
    // Verify all locations in event exist
    for (const locId of event.locations) {
      const location = unifiedData.locations.find(l => l.id === locId);
      if (!location) {
        errors.push({
          type: 'missing_location',
          entity_type: 'event',
          entity_id: event.id,
          field: 'locations',
          expected: `Location ${locId} should exist`,
          actual: 'not found',
          message: `Event ${event.title} references location ${locId} that doesn't exist`,
        });
      }
    }
    
    // Verify event is in location's event list
    for (const locId of event.locations) {
      const locEvents = unifiedData.relationships.locationEvent.get(locId);
      if (!locEvents || !locEvents.has(event.id)) {
        errors.push({
          type: 'event_not_in_location_events',
          entity_type: 'event',
          entity_id: event.id,
          field: 'location_events',
          expected: `Event ${event.id} should be in location ${locId}'s events`,
          actual: 'missing',
          message: `Event ${event.title} has location ${locId} but location's event list doesn't include this event`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Event Memory Counts
  // ============================================================================
  for (const event of unifiedData.events) {
    // Verify all memories in event exist
    for (const memId of event.memories) {
      const memory = unifiedData.memories.find(m => m.id === memId);
      if (!memory) {
        errors.push({
          type: 'missing_memory',
          entity_type: 'event',
          entity_id: event.id,
          field: 'memories',
          expected: `Memory ${memId} should exist`,
          actual: 'not found',
          message: `Event ${event.title} references memory ${memId} that doesn't exist`,
        });
      } else if (!memory.linked_events.includes(event.id)) {
        errors.push({
          type: 'memory_not_linked_to_event',
          entity_type: 'memory',
          entity_id: memId,
          field: 'linked_events',
          expected: `Memory should link to event ${event.id}`,
          actual: 'missing',
          message: `Memory ${memory.title} is in event ${event.title} but doesn't link back to event`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Memory Character Links
  // ============================================================================
  for (const memory of unifiedData.memories) {
    // Verify all linked characters exist
    for (const charId of memory.linked_characters) {
      const character = unifiedData.characters.find(c => c.id === charId);
      if (!character) {
        errors.push({
          type: 'missing_character',
          entity_type: 'memory',
          entity_id: memory.id,
          field: 'linked_characters',
          expected: `Character ${charId} should exist`,
          actual: 'not found',
          message: `Memory ${memory.title} references character ${charId} that doesn't exist`,
        });
      }
    }
    
    // Verify memory characters match memory.characters array
    const memoryCharNames = memory.characters;
    const linkedCharNames = memory.linked_characters.map(charId => {
      const char = unifiedData.characters.find(c => c.id === charId);
      return char?.name;
    }).filter(Boolean);
    
    // Check if there's a mismatch (allowing for name variations)
    if (memoryCharNames.length > 0 && linkedCharNames.length > 0) {
      const hasOverlap = memoryCharNames.some(name => 
        linkedCharNames.some(linkedName => 
          name.toLowerCase().includes(linkedName?.toLowerCase() || '') ||
          linkedName?.toLowerCase().includes(name.toLowerCase() || '')
        )
      );
      
      if (!hasOverlap && memoryCharNames.length > 0) {
        warnings.push({
          type: 'character_name_mismatch',
          entity_type: 'memory',
          entity_id: memory.id,
          message: `Memory ${memory.title} has characters=${memoryCharNames.join(', ')} but linked_characters=${linkedCharNames.join(', ')}`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Memory Location Links
  // ============================================================================
  for (const memory of unifiedData.memories) {
    // Verify all linked locations exist
    for (const locId of memory.linked_locations) {
      const location = unifiedData.locations.find(l => l.id === locId);
      if (!location) {
        errors.push({
          type: 'missing_location',
          entity_type: 'memory',
          entity_id: memory.id,
          field: 'linked_locations',
          expected: `Location ${locId} should exist`,
          actual: 'not found',
          message: `Memory ${memory.title} references location ${locId} that doesn't exist`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Memory Skill Links
  // ============================================================================
  for (const memory of unifiedData.memories) {
    // Verify all linked skills exist
    for (const skillId of memory.linked_skills) {
      const skill = unifiedData.skills.find(s => s.id === skillId);
      if (!skill) {
        errors.push({
          type: 'missing_skill',
          entity_type: 'memory',
          entity_id: memory.id,
          field: 'linked_skills',
          expected: `Skill ${skillId} should exist`,
          actual: 'not found',
          message: `Memory ${memory.title} references skill ${skillId} that doesn't exist`,
        });
      }
    }
  }

  // ============================================================================
  // Validate Relationship Bidirectionality
  // ============================================================================
  for (const char1 of unifiedData.characters) {
    if (char1.metadata?.relationships) {
      for (const [char2Id, rel1] of Object.entries(char1.metadata.relationships)) {
        const char2 = unifiedData.characters.find(c => c.id === char2Id);
        if (char2?.metadata?.relationships?.[char1.id]) {
          const rel2 = char2.metadata.relationships[char1.id];
          // Check if relationship types are compatible
          if (rel1.type !== rel2.type && !isCompatibleRelationshipType(rel1.type, rel2.type)) {
            warnings.push({
              type: 'relationship_type_mismatch',
              entity_type: 'character',
              entity_id: char1.id,
              message: `Character ${char1.name} has ${rel1.type} relationship with ${char2.name}, but ${char2.name} has ${rel2.type} relationship with ${char1.name}`,
            });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function isCompatibleRelationshipType(type1: string, type2: string): boolean {
  // Some relationship types are naturally one-way (e.g., teacher-student)
  const compatiblePairs = [
    ['friend', 'friend'],
    ['romantic', 'romantic'],
    ['family', 'family'],
    ['teacher', 'student'],
    ['student', 'teacher'],
    ['mentor', 'mentee'],
    ['mentee', 'mentor'],
  ];
  
  return compatiblePairs.some(pair => 
    (pair[0] === type1 && pair[1] === type2) ||
    (pair[0] === type2 && pair[1] === type1)
  );
}

// ============================================================================
// Quick Validation Functions
// ============================================================================

export function validateCharacterStats(characterId: string, data?: UnifiedNarrativeData): ValidationResult {
  const unifiedData = data || generateUnifiedNarrativeData();
  const character = unifiedData.characters.find(c => c.id === characterId);
  
  if (!character) {
    return {
      valid: false,
      errors: [{
        type: 'character_not_found',
        entity_type: 'character',
        entity_id: characterId,
        field: 'id',
        expected: 'Character should exist',
        actual: 'not found',
        message: `Character ${characterId} not found`,
      }],
      warnings: [],
    };
  }
  
  // Validate memory count
  const actualMemoryCount = unifiedData.memories.filter(m => 
    m.linked_characters.includes(characterId)
  ).length;
  
  const errors: ValidationError[] = [];
  if (character.memory_count !== actualMemoryCount) {
    errors.push({
      type: 'memory_count_mismatch',
      entity_type: 'character',
      entity_id: characterId,
      field: 'memory_count',
      expected: actualMemoryCount,
      actual: character.memory_count,
      message: `Character ${character.name} has memory_count=${character.memory_count} but actually appears in ${actualMemoryCount} memories`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

export function validateLocationStats(locationId: string, data?: UnifiedNarrativeData): ValidationResult {
  const unifiedData = data || generateUnifiedNarrativeData();
  const location = unifiedData.locations.find(l => l.id === locationId);
  
  if (!location) {
    return {
      valid: false,
      errors: [{
        type: 'location_not_found',
        entity_type: 'location',
        entity_id: locationId,
        field: 'id',
        expected: 'Location should exist',
        actual: 'not found',
        message: `Location ${locationId} not found`,
      }],
      warnings: [],
    };
  }
  
  // Calculate total visits from character metadata
  let calculatedVisitCount = 0;
  for (const assoc of location.associated_characters) {
    calculatedVisitCount += assoc.visit_count;
  }
  
  const errors: ValidationError[] = [];
  if (location.visitCount !== calculatedVisitCount) {
    errors.push({
      type: 'visit_count_mismatch',
      entity_type: 'location',
      entity_id: locationId,
      field: 'visitCount',
      expected: calculatedVisitCount,
      actual: location.visitCount,
      message: `Location ${location.name} has visitCount=${location.visitCount} but sum of character visits=${calculatedVisitCount}`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

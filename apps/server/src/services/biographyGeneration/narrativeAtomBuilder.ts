/**
 * NarrativeAtomBuilder
 * Builds NarrativeAtoms from engine outputs and timeline data
 * This is the data ingestion layer
 */

import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';
import { timelineEngine } from '../timeline';

import type { NarrativeAtom, NarrativeAtomType, Domain } from './types';

/**
 * Build narrative atoms from timeline entries
 */
export async function buildAtomsFromTimeline(userId: string): Promise<NarrativeAtom[]> {
  try {
    // Get timeline entries
    const entries = await memoryService.searchEntries(userId, { limit: 1000 });
    
    const atoms: NarrativeAtom[] = [];
    
    // Batch fetch all relationships for efficiency
    const entryIds = entries.map(e => e.id);
    
    // Fetch all character memories
    const { data: allCharacterMemories } = await supabaseAdmin
      .from('character_memories')
      .select('character_id, journal_entry_id')
      .in('journal_entry_id', entryIds);
    
    // Fetch all location mentions
    const { data: allLocationMentions } = await supabaseAdmin
      .from('location_mentions')
      .select('location_id, memory_id')
      .in('memory_id', entryIds);
    
    // Fetch all event mentions
    const { data: allEventMentions } = await supabaseAdmin
      .from('event_mentions')
      .select('event_id, memory_id')
      .in('memory_id', entryIds);
    
    // Fetch all skill progress
    const { data: allSkillProgress } = await supabaseAdmin
      .from('skill_progress')
      .select('skill_id, source_id')
      .in('source_id', entryIds);
    
    // Create lookup maps
    const characterMap = new Map<string, string[]>();
    const locationMap = new Map<string, string[]>();
    const eventMap = new Map<string, string[]>();
    const skillMap = new Map<string, string[]>();
    
    (allCharacterMemories || []).forEach(cm => {
      if (!characterMap.has(cm.journal_entry_id)) {
        characterMap.set(cm.journal_entry_id, []);
      }
      characterMap.get(cm.journal_entry_id)!.push(cm.character_id);
    });
    
    (allLocationMentions || []).forEach(lm => {
      if (!locationMap.has(lm.memory_id)) {
        locationMap.set(lm.memory_id, []);
      }
      locationMap.get(lm.memory_id)!.push(lm.location_id);
    });
    
    (allEventMentions || []).forEach(em => {
      if (!eventMap.has(em.memory_id)) {
        eventMap.set(em.memory_id, []);
      }
      eventMap.get(em.memory_id)!.push(em.event_id);
    });
    
    (allSkillProgress || []).forEach(sp => {
      if (!skillMap.has(sp.source_id)) {
        skillMap.set(sp.source_id, []);
      }
      skillMap.get(sp.source_id)!.push(sp.skill_id);
    });
    
    for (const entry of entries) {
      // Determine atom type from entry metadata
      const atomType = determineAtomType(entry);
      if (!atomType) continue;
      
      // Extract domains from entry tags/content
      const domains = extractDomains(entry);
      
      // Get relationships from maps
      const peopleIds = characterMap.get(entry.id) || [];
      const locationIds = locationMap.get(entry.id) || [];
      const eventIds = eventMap.get(entry.id) || [];
      const skillIds = skillMap.get(entry.id) || [];
      
      // Calculate emotional weight, significance, and sensitivity
      const emotionalWeight = calculateEmotionalWeight(entry);
      const significance = calculateSignificance(entry);
      const sensitivity = calculateSensitivity(entry);
      
      // For preserved content types, use original_content or full content
      // For other entries, use summary or truncated content
      const isPreserved = (entry as any).preserve_original_language === true;
      const preservedContent = (entry as any).original_content || entry.content;
      const atomContent = isPreserved 
        ? preservedContent // Use full original content for preserved entries
        : (entry.summary || entry.content?.substring(0, 200) || ''); // Pre-summarized text for others
      
      // Create atom (AST node)
      const atom: NarrativeAtom = {
        id: `atom-${entry.id}`,
        type: atomType,
        timestamp: entry.date || entry.created_at,
        domains,
        emotionalWeight,
        sensitivity, // NEW: for content filtering
        significance,
        peopleIds,
        tags: entry.tags || [],
        content: atomContent,
        timelineIds: [entry.id],
        sourceRefs: [entry.id],
        metadata: {
          source: 'timeline',
          entryId: entry.id,
          locationIds,
          eventIds,
          skillIds,
          preserve_original_language: isPreserved,
          content_type: (entry as any).content_type,
        }
      };
      
      atoms.push(atom);
    }
    
    return atoms;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build atoms from timeline');
    return [];
  }
}

// Experiment: minimum continuity_strength for an event_candidate to be
// surfaced as a narrative atom. Mirrors the `timeline_candidate` cutoff.
const EVENT_CANDIDATE_ATOM_THRESHOLD = 0.60;

// Keyword → domain heuristic so recurring scenes land in domain-scoped
// queries (e.g. "Living Situation with Family Members" -> family) instead
// of all collapsing into a generic 'personal' bucket.
const DOMAIN_KEYWORDS: Array<[Domain, string[]]> = [
  ['family', ['family', 'abuela', 'mom', 'dad', 'parent', 'sibling', 'grandma', 'grandpa']],
  ['romance', ['relationship', 'breakup', 'heartbreak', 'dating', 'boyfriend', 'girlfriend']],
  ['friendship', ['friend', 'hangout', 'hanging']],
  ['professional', ['interview', 'job', 'career', 'work', 'office']],
  ['creative', ['lorebook', 'building', 'coding', 'music', 'writing', 'art']],
  ['health', ['gym', 'exercise', 'therapy', 'health']],
  ['education', ['studying', 'school', 'class', 'exam']],
];

function inferDomains(canonicalTitle: string, recurringActivities: string[]): Domain[] {
  const haystack = [canonicalTitle, ...recurringActivities].join(' ').toLowerCase();
  const matches = DOMAIN_KEYWORDS.filter(([, keywords]) => keywords.some(k => haystack.includes(k))).map(([domain]) => domain);
  return matches.length > 0 ? matches : ['personal'];
}

/**
 * Build atoms from high-confidence event_candidates (recurring autobiographical
 * scenes detected across sessions). Experimental enrichment source — additive
 * only, does not replace or alter buildAtomsFromTimeline.
 */
export async function buildAtomsFromEventCandidates(userId: string): Promise<NarrativeAtom[]> {
  try {
    const { data: candidates, error } = await supabaseAdmin
      .from('event_candidates')
      .select('id, canonical_title, dominant_entities, dominant_entity_names, recurring_activities, occurrence_count, continuity_strength, source_event_ids, first_seen_at, last_seen_at')
      .eq('user_id', userId)
      .gte('continuity_strength', EVENT_CANDIDATE_ATOM_THRESHOLD);

    if (error || !candidates) return [];

    return candidates.map((c): NarrativeAtom => {
      const names = c.dominant_entity_names || [];
      return {
        id: `event-candidate-${c.id}`,
        type: 'event',
        timestamp: c.last_seen_at || c.first_seen_at,
        domains: inferDomains(c.canonical_title, c.recurring_activities || []),
        emotionalWeight: 0.5,
        sensitivity: 0.3,
        significance: c.continuity_strength,
        peopleIds: c.dominant_entities || [],
        tags: ['recurring-scene', ...(c.recurring_activities || [])],
        content: `A recurring pattern: "${c.canonical_title}" — observed ${c.occurrence_count} times${names.length ? `, involving ${names.join(', ')}` : ''}.`,
        timelineIds: c.source_event_ids || [],
        sourceRefs: c.source_event_ids || [],
        metadata: {
          source: 'event_candidate',
          occurrenceCount: c.occurrence_count,
          continuityStrength: c.continuity_strength,
          firstSeenAt: c.first_seen_at,
        },
      };
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build atoms from event candidates');
    return [];
  }
}

/**
 * Build atoms from engine outputs
 */
export async function buildAtomsFromEngines(userId: string): Promise<NarrativeAtom[]> {
  try {
    const atoms: NarrativeAtom[] = [];
    
    // Get turning points from StoryOfSelfEngine
    // Get conflicts from ConflictResolver
    // Get achievements from XPEngine
    // etc.
    
    // For now, return empty - will be populated as engines provide structured outputs
    return atoms;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build atoms from engines');
    return [];
  }
}

/**
 * Determine atom type from entry
 */
function determineAtomType(entry: any): NarrativeAtomType | null {
  const content = (entry.content || entry.summary || '').toLowerCase();
  const tags = (entry.tags || []).map((t: string) => t.toLowerCase());
  
  // Check for conflict indicators
  if (content.includes('fight') || content.includes('conflict') || content.includes('argument') || tags.includes('conflict')) {
    return 'conflict';
  }
  
  // Check for achievement indicators
  if (content.includes('achieved') || content.includes('completed') || content.includes('won') || tags.includes('achievement')) {
    return 'achievement';
  }
  
  // Check for turning point indicators
  if (content.includes('changed') || content.includes('turning point') || content.includes('realized') || tags.includes('turning_point')) {
    return 'turning_point';
  }
  
  // Check for reflection indicators
  if (content.includes('think') || content.includes('feel') || content.includes('realize') || tags.includes('reflection')) {
    return 'reflection';
  }
  
  // Default to event
  return 'event';
}

/**
 * Extract domains from entry
 */
function extractDomains(entry: any): Domain[] {
  const domains: Domain[] = [];
  const content = (entry.content || entry.summary || '').toLowerCase();
  const tags = (entry.tags || []).map((t: string) => t.toLowerCase());
  
  // Domain detection logic
  if (content.includes('fight') || content.includes('bjj') || content.includes('martial') || tags.includes('fighting')) {
    domains.push('fighting');
  }
  
  if (content.includes('robot') || content.includes('code') || content.includes('programming') || tags.includes('robotics') || tags.includes('coding')) {
    domains.push('robotics');
  }
  
  if (content.includes('relationship') || content.includes('friend') || content.includes('partner') || tags.includes('relationship')) {
    domains.push('relationships');
  }
  
  if (content.includes('art') || content.includes('creative') || content.includes('design') || tags.includes('creative')) {
    domains.push('creative');
  }
  
  if (content.includes('work') || content.includes('job') || content.includes('career') || tags.includes('professional')) {
    domains.push('professional');
  }
  
  // Default to personal if no domain detected
  if (domains.length === 0) {
    domains.push('personal');
  }
  
  return domains;
}

/**
 * Calculate emotional weight (0-1)
 */
function calculateEmotionalWeight(entry: any): number {
  // Simple heuristic - can be enhanced with emotion detection
  const content = (entry.content || entry.summary || '').toLowerCase();
  
  let weight = 0.5; // Base weight
  
  // Increase for emotional words
  const emotionalWords = ['love', 'hate', 'angry', 'sad', 'happy', 'excited', 'fear', 'anxious', 'proud', 'ashamed'];
  const emotionalCount = emotionalWords.filter(word => content.includes(word)).length;
  weight += Math.min(emotionalCount * 0.1, 0.4);
  
  // Increase for conflict/achievement
  if (content.includes('fight') || content.includes('conflict') || content.includes('achieved') || content.includes('won')) {
    weight += 0.2;
  }
  
  return Math.min(weight, 1.0);
}

/**
 * Calculate significance (0-1)
 */
function calculateSignificance(entry: any): number {
  // Simple heuristic - can be enhanced
  let significance = 0.5; // Base significance
  
  // Increase for length (more detailed entries are often more significant)
  const contentLength = (entry.content || entry.summary || '').length;
  if (contentLength > 500) significance += 0.2;
  if (contentLength > 1000) significance += 0.1;
  
  // Increase for turning points
  const content = (entry.content || entry.summary || '').toLowerCase();
  if (content.includes('turning point') || content.includes('changed') || content.includes('realized')) {
    significance += 0.3;
  }
  
  return Math.min(significance, 1.0);
}

/**
 * Calculate sensitivity (0-1) for content filtering
 */
function calculateSensitivity(entry: any): number {
  const content = (entry.content || entry.summary || '').toLowerCase();
  let sensitivity = 0.0;
  
  // High sensitivity keywords
  const highSensitivity = ['suicide', 'self-harm', 'abuse', 'trauma', 'addiction', 'illegal', 'criminal'];
  const mediumSensitivity = ['depression', 'anxiety', 'divorce', 'affair', 'betrayal', 'secret'];
  
  // Check for high sensitivity
  if (highSensitivity.some(keyword => content.includes(keyword))) {
    sensitivity = 0.9;
  } else if (mediumSensitivity.some(keyword => content.includes(keyword))) {
    sensitivity = 0.6;
  }
  
  // Increase for high emotional weight
  if (calculateEmotionalWeight(entry) > 0.8) {
    sensitivity = Math.max(sensitivity, 0.7);
  }
  
  return Math.min(sensitivity, 1.0);
}

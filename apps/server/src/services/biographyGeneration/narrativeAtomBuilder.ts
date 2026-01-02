/**
 * NarrativeAtomBuilder
 * Builds NarrativeAtoms from engine outputs and timeline data
 * This is the data ingestion layer
 */

import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';
import type { NarrativeAtom, NarrativeAtomType, Domain } from './types';
import { timelineEngine } from '../timeline';

/**
 * Build narrative atoms from timeline entries
 */
export async function buildAtomsFromTimeline(userId: string): Promise<NarrativeAtom[]> {
  try {
    // Get timeline entries
    const entries = await memoryService.searchEntries(userId, { limit: 1000 });
    
    const atoms: NarrativeAtom[] = [];
    
    for (const entry of entries) {
      // Determine atom type from entry metadata
      const atomType = determineAtomType(entry);
      if (!atomType) continue;
      
      // Extract domains from entry tags/content
      const domains = extractDomains(entry);
      
      // Extract people and locations (would need entity resolution)
      const peopleIds: string[] = [];
      const locationIds: string[] = [];
      
      // Calculate emotional weight, significance, and sensitivity
      const emotionalWeight = calculateEmotionalWeight(entry);
      const significance = calculateSignificance(entry);
      const sensitivity = calculateSensitivity(entry);
      
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
        content: entry.summary || entry.content?.substring(0, 200) || '', // Pre-summarized text
        timelineIds: [entry.id],
        sourceRefs: [entry.id],
        metadata: {
          source: 'timeline',
          entryId: entry.id
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

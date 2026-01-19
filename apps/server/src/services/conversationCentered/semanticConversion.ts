// =====================================================
// SEMANTIC TO MEMORY CONVERSION SERVICE
// Purpose: Finalization layer that commits semantic understanding to memory artifacts
// This is the bridge between "what was said" and "what is remembered"
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';
import { memoryService } from '../memoryService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perceptionService } from '../perceptionService';
import { supabaseAdmin } from '../supabaseClient';

export type ConversionContext = {
  userId: string;
  messageId: string;
  sessionId: string;
  utteranceId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type ConversionResult = {
  perceptionEntries: string[];
  journalEntries: string[];
  insights: string[];
};

/**
 * Converts semantic units into memory artifacts
 * This is the finalization layer that commits understanding to memory
 */
export class SemanticConversionService {
  /**
   * Convert extracted units to memory artifacts
   */
  async convertUnitsToMemoryArtifacts(
    units: ExtractedUnit[],
    context: ConversionContext
  ): Promise<ConversionResult> {
    const result: ConversionResult = {
      perceptionEntries: [],
      journalEntries: [],
      insights: [],
    };

    for (const unit of units) {
      try {
        // PERCEPTION → perception_entries
        if (unit.type === 'PERCEPTION') {
          const perceptionId = await this.convertPerceptionToEntry(unit, context);
          if (perceptionId) {
            result.perceptionEntries.push(perceptionId);
          }
        }

        // EXPERIENCE (ONGOING) → journal_entries
        // Skip journal entry creation for AI responses (they're interpretations, not facts)
        if (unit.type === 'EXPERIENCE' && unit.metadata?.source !== 'ai_interpretation') {
          const temporalScope = unit.metadata?.temporal_scope ?? 
                               this.inferTemporalScope(unit.content);
          
          // Fixed: Single canonical decision point for ONGOING
          if (temporalScope === 'ONGOING') {
            const entryId = await this.convertOngoingExperienceToEntry(unit, context);
            if (entryId) {
              result.journalEntries.push(entryId);
            }
          }
        }

        // FEELING → insights (emotional markers)
        if (unit.type === 'FEELING') {
          const insightId = await this.convertFeelingToInsight(unit, context);
          if (insightId) {
            result.insights.push(insightId);
          }
        }

        // THOUGHT → insights (cognitive markers)
        if (unit.type === 'THOUGHT') {
          const insightId = await this.convertThoughtToInsight(unit, context);
          if (insightId) {
            result.insights.push(insightId);
          }
        }
      } catch (error) {
        logger.warn({ error, unitId: unit.id, unitType: unit.type }, 
          'Failed to convert unit to memory artifact (non-blocking)');
      }
    }

    return result;
  }

  /**
   * Convert PERCEPTION unit to perception_entry
   */
  private async convertPerceptionToEntry(
    unit: ExtractedUnit,
    context: ConversionContext
  ): Promise<string | null> {
    try {
      // Extract subject (who the perception is about)
      const subject = this.extractSubject(unit.content);
      if (!subject) {
        logger.debug({ unitId: unit.id }, 'No subject found for perception, skipping');
        return null;
      }

      // Normalize belief framing (ensure it's "I believe..." not "They do...")
      const normalizedContent = this.normalizeBeliefFraming(unit.content);

      // Estimate confidence (perceptions are low confidence by default)
      const confidence = this.estimatePerceptionConfidence(unit);

      // Infer impact on user
      const impact = this.inferImpact(unit.content);

      // Try to resolve subject to character
      let subjectPersonId: string | null = null;
      try {
        const entities = await omegaMemoryService.extractEntities(unit.content);
        const resolved = await omegaMemoryService.resolveEntities(context.userId, entities);
        const personEntity = resolved.find(e => e.type === 'PERSON' && 
          subject.toLowerCase().includes(e.name.toLowerCase()));
        if (personEntity) {
          subjectPersonId = personEntity.id;
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to resolve perception subject to character');
      }

      // Fixed: Use unit's own utterance_id if available
      const utteranceId = unit.utterance_id ?? context.utteranceId;

      // Create perception entry
      const perception = await perceptionService.createPerceptionEntry(context.userId, {
        subject_alias: subject,
        subject_person_id: subjectPersonId || undefined,
        content: normalizedContent,
        source: 'intuition', // Default for chat-derived perceptions
        confidence_level: confidence,
        sentiment: this.inferSentiment(unit.content),
        timestamp_heard: new Date().toISOString(),
        impact_on_me: impact,
        metadata: {
          source_message_id: context.messageId,
          utterance_id: utteranceId,
          session_id: context.sessionId,
          extracted_unit_id: unit.id,
        },
      });

      logger.info({ 
        userId: context.userId, 
        perceptionId: perception.id, 
        subject 
      }, 'Converted PERCEPTION unit to perception_entry');

      return perception.id;
    } catch (error) {
      logger.error({ error, unitId: unit.id }, 'Failed to convert PERCEPTION to entry');
      return null;
    }
  }

  /**
   * Convert EXPERIENCE (ONGOING) unit to journal_entry
   */
  private async convertOngoingExperienceToEntry(
    unit: ExtractedUnit,
    context: ConversionContext
  ): Promise<string | null> {
    try {
      // Extract tags from content
      const tags = this.extractTags(unit.content);
      tags.push('ongoing'); // Mark as ongoing pattern

      // Fixed: Use unit's own utterance_id if available
      const utteranceId = unit.utterance_id ?? context.utteranceId;

      // Create journal entry
      const entry = await memoryService.saveEntry({
        userId: context.userId,
        content: unit.content,
        tags,
        source: 'chat',
        metadata: {
          temporal_scope: 'ONGOING',
          source_message_id: context.messageId,
          utterance_id: utteranceId,
          session_id: context.sessionId,
          extracted_unit_id: unit.id,
          confidence: unit.confidence,
        },
      });

      logger.info({ 
        userId: context.userId, 
        entryId: entry.id 
      }, 'Converted EXPERIENCE (ONGOING) unit to journal_entry');

      return entry.id;
    } catch (error) {
      logger.error({ error, unitId: unit.id }, 'Failed to convert EXPERIENCE to entry');
      return null;
    }
  }

  /**
   * Convert FEELING unit to insight
   */
  private async convertFeelingToInsight(
    unit: ExtractedUnit,
    context: ConversionContext
  ): Promise<string | null> {
    try {
      const intensity = this.inferIntensity(unit.content);

      // Fixed: Use unit's own utterance_id if available
      const utteranceId = unit.utterance_id ?? context.utteranceId;

      const { data: insight, error } = await supabaseAdmin
        .from('insights')
        .insert({
          user_id: context.userId,
          category: 'emotional_state',
          content: unit.content,
          intensity,
          metadata: {
            source_message_id: context.messageId,
            utterance_id: utteranceId,
            session_id: context.sessionId,
            extracted_unit_id: unit.id,
            unit_type: 'FEELING',
          },
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      logger.debug({ 
        userId: context.userId, 
        insightId: insight.id 
      }, 'Converted FEELING unit to insight');

      return insight.id;
    } catch (error) {
      logger.warn({ error, unitId: unit.id }, 'Failed to convert FEELING to insight');
      return null;
    }
  }

  /**
   * Convert THOUGHT unit to insight
   */
  private async convertThoughtToInsight(
    unit: ExtractedUnit,
    context: ConversionContext
  ): Promise<string | null> {
    try {
      // Fixed: Use unit's own utterance_id if available
      const utteranceId = unit.utterance_id ?? context.utteranceId;

      const { data: insight, error } = await supabaseAdmin
        .from('insights')
        .insert({
          user_id: context.userId,
          category: 'cognitive_pattern',
          content: unit.content,
          metadata: {
            source_message_id: context.messageId,
            utterance_id: utteranceId,
            session_id: context.sessionId,
            extracted_unit_id: unit.id,
            unit_type: 'THOUGHT',
          },
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      logger.debug({ 
        userId: context.userId, 
        insightId: insight.id 
      }, 'Converted THOUGHT unit to insight');

      return insight.id;
    } catch (error) {
      logger.warn({ error, unitId: unit.id }, 'Failed to convert THOUGHT to insight');
      return null;
    }
  }

  // ========== Helper Methods ==========

  /**
   * Extract subject from perception content
   * "I get disrespected by my family" → "my family"
   */
  private extractSubject(content: string): string | null {
    // Pattern: "by [subject]" or "from [subject]" or "[subject] [verb]"
    const byPattern = /(?:by|from)\s+(?:my|the|a|an)?\s*([a-z\s]+?)(?:\s|$|,|\.)/i;
    const match = content.match(byPattern);
    if (match && match[1]) {
      return match[1].trim();
    }

    // Fallback: look for common relationship terms
    const relationshipTerms = ['family', 'parents', 'mother', 'father', 'sibling', 
                               'friend', 'colleague', 'boss', 'partner'];
    const lowerContent = content.toLowerCase();
    for (const term of relationshipTerms) {
      if (lowerContent.includes(term)) {
        return term;
      }
    }

    return null;
  }

  /**
   * Normalize belief framing to "I believe..." format
   */
  private normalizeBeliefFraming(content: string): string {
    // If already starts with "I believe", "I think", etc., keep it
    if (/^i\s+(believe|think|feel|perceive|sense)/i.test(content)) {
      return content;
    }

    // Otherwise, frame it as a belief
    return `I believe ${content.toLowerCase()}`;
  }

  /**
   * Estimate confidence for perception (defaults low)
   */
  private estimatePerceptionConfidence(unit: ExtractedUnit): number {
    // Perceptions are inherently uncertain
    // Use unit confidence if available, but cap at 0.5
    const baseConfidence = unit.confidence || 0.4;
    return Math.min(baseConfidence, 0.5);
  }

  /**
   * Infer impact on user from content
   */
  private inferImpact(content: string): string {
    const lower = content.toLowerCase();
    
    if (lower.includes('disrespect') || lower.includes('disrespected')) {
      return 'Makes me feel disrespected and affects my relationship';
    }
    if (lower.includes('hurt') || lower.includes('hurts')) {
      return 'Causes emotional pain';
    }
    if (lower.includes('angry') || lower.includes('anger')) {
      return 'Triggers anger and affects my emotional state';
    }
    if (lower.includes('sad') || lower.includes('sadness')) {
      return 'Causes sadness and affects my mood';
    }
    
    return 'Affects my emotional state and relationships';
  }

  /**
   * Infer sentiment from content
   */
  private inferSentiment(content: string): 'positive' | 'negative' | 'neutral' | 'mixed' {
    const lower = content.toLowerCase();
    const negativeWords = ['disrespect', 'hurt', 'angry', 'sad', 'disappointed', 'frustrated'];
    const positiveWords = ['happy', 'proud', 'grateful', 'appreciated'];
    
    const hasNegative = negativeWords.some(word => lower.includes(word));
    const hasPositive = positiveWords.some(word => lower.includes(word));
    
    if (hasNegative && hasPositive) return 'mixed';
    if (hasNegative) return 'negative';
    if (hasPositive) return 'positive';
    return 'neutral';
  }

  /**
   * Infer temporal scope from content
   * Includes isOngoingPattern logic as fallback
   */
  private inferTemporalScope(content: string): 'MOMENT' | 'PERIOD' | 'ONGOING' | 'UNKNOWN' {
    const lower = content.toLowerCase();
    
    // Ongoing patterns (includes isOngoingPattern logic)
    const ongoingPatterns = [
      /\b(get|gets|getting)\s+\w+ed\b/i, // "I get disrespected"
      /\b(always|often|usually|regularly|constantly|repeatedly)\b/i,
      /\b(keep|keeps|kept)\s+\w+ing\b/i, // "I keep getting..."
    ];
    
    if (ongoingPatterns.some(pattern => pattern.test(lower))) {
      return 'ONGOING';
    }
    
    // Past tense = moment or period
    if (/\b(went|did|met|saw|visited|attended|completed)\b/.test(lower)) {
      return 'MOMENT';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const lower = content.toLowerCase();
    
    // Common tags
    if (lower.includes('family')) tags.push('family');
    if (lower.includes('work') || lower.includes('working')) tags.push('work');
    if (lower.includes('respect') || lower.includes('disrespect')) tags.push('respect');
    if (lower.includes('hand') || lower.includes('hands')) tags.push('hands-on-work');
    
    return tags;
  }

  /**
   * Infer emotional intensity (0.0 to 1.0)
   */
  private inferIntensity(content: string): number {
    const lower = content.toLowerCase();
    
    // High intensity markers
    if (/\b(extremely|incredibly|overwhelming|devastating|crushing)\b/.test(lower)) {
      return 0.9;
    }
    
    // Medium-high
    if (/\b(very|really|quite|pretty)\b/.test(lower)) {
      return 0.7;
    }
    
    // Medium
    if (/\b(somewhat|kind of|a bit)\b/.test(lower)) {
      return 0.5;
    }
    
    // Default medium
    return 0.6;
  }
}

export const semanticConversionService = new SemanticConversionService();

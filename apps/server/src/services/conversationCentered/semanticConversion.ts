// =====================================================
// SEMANTIC TO MEMORY CONVERSION SERVICE
// Purpose: Finalization layer that commits semantic understanding to memory artifacts
// This is the bridge between "what was said" and "what is remembered"
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';
import { memoryService } from '../memoryService';
import { perceptionChatService } from '../perceptionChatService';
import { supabaseAdmin } from '../supabaseClient';

export type ConversionContext = {
  userId: string;
  messageId: string;
  sessionId: string;
  utteranceId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  // Phase B single-pass: message-level resolved entities (id+type+name). When
  // present, per-unit conversion reuses them instead of re-running
  // extractEntities + resolveEntities — the unit text is always a subset of the
  // message text, so the message set is a superset of the unit's entities.
  // `undefined` = message-level resolution did not run (fall back to per-unit);
  // `[]` = it ran and found nothing (no subject person, no extra LLM call).
  resolvedEntities?: Array<{ id: string; type: string; name: string }>;
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
          const perceptionIds = await this.convertPerceptionToEntry(unit, context);
          result.perceptionEntries.push(...perceptionIds);
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
   * Convert PERCEPTION unit(s) to perception_entry rows. Delegates the actual
   * subject/content/source/sentiment/impact extraction to
   * perceptionChatService — the same LLM extraction that used to be reachable
   * only from the standalone Gossip Chat modal, now running automatically on
   * ordinary chat once the upstream classifier already flagged this unit as
   * perception-shaped. A hand-rolled regex ("by X" / "from X") used to do this
   * job and missed nearly everything that wasn't phrased that exact way.
   */
  private async convertPerceptionToEntry(
    unit: ExtractedUnit,
    context: ConversionContext
  ): Promise<string[]> {
    try {
      const extraction = await perceptionChatService.extractPerceptionsFromChat(
        context.userId,
        unit.content,
        context.conversationHistory ?? []
      );

      if (extraction.perceptions.length === 0) {
        logger.debug({ unitId: unit.id }, 'No perception content extracted from unit, skipping');
        return [];
      }

      // Fall back to the message-level resolved entities for any perception
      // the LLM's own character lookup didn't already resolve to a person.
      if (context.resolvedEntities?.length) {
        for (const perception of extraction.perceptions) {
          if (perception.subject_person_id) continue;
          const subjectLower = perception.subject_alias.toLowerCase();
          const hit = context.resolvedEntities.find(
            e => e.type === 'PERSON' && e.name && subjectLower.includes(e.name.toLowerCase())
          );
          if (hit) perception.subject_person_id = hit.id;
        }
      }

      const utteranceId = unit.utterance_id ?? context.utteranceId;
      const created = await perceptionChatService.createPerceptionsFromExtraction(
        context.userId,
        extraction,
        {
          source_message_id: context.messageId,
          utterance_id: utteranceId,
          session_id: context.sessionId,
          extracted_unit_id: unit.id,
        }
      );

      logger.info({
        userId: context.userId,
        unitId: unit.id,
        perceptionIds: created.map(p => p.id),
      }, 'Converted PERCEPTION unit to perception_entry');

      return created.map(p => p.id);
    } catch (error) {
      logger.error({ error, unitId: unit.id }, 'Failed to convert PERCEPTION to entry');
      return [];
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

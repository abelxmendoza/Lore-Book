// =====================================================
// EVENT ASSEMBLY SERVICE
// Purpose: Assemble structured events from extracted units
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { omegaMemoryService } from '../omegaMemoryService';
import { confidenceTrackingService } from '../confidenceTrackingService';
import { metaControlService } from '../metaControlService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import { beliefRealityReconciliationService } from '../beliefRealityReconciliationService';
import type { ExtractedUnit, EventAssemblyResult } from '../../types/conversationCentered';

/**
 * Assembles structured events from EXPERIENCE units
 */
export class EventAssemblyService {
  /**
   * Assemble events from extracted units
   * Groups EXPERIENCE units by WHO/WHERE/WHEN
   */
  async assembleEvents(userId: string): Promise<EventAssemblyResult[]> {
    try {
      // Get all EXPERIENCE units (excluding deprecated and pruned units)
      const { data: allUnits, error } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'EXPERIENCE')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      // Filter out deprecated and pruned units
      const experienceUnits = (allUnits || []).filter(
        unit =>
          !unit.metadata?.deprecated &&
          !unit.metadata?.pruned &&
          unit.confidence > 0.2 // Also filter very low confidence units
      );

      if (error) {
        throw error;
      }

      if (!experienceUnits || experienceUnits.length === 0) {
        return [];
      }

      // Group units by temporal and entity proximity
      const eventGroups = this.groupUnitsIntoEvents(experienceUnits);

      // Create or update events
      const results: EventAssemblyResult[] = [];
      for (const group of eventGroups) {
        const event = await this.createOrUpdateEvent(userId, group);
        results.push(event);
      }

      return results;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to assemble events');
      throw error;
    }
  }

  /**
   * Group units into potential events
   */
  private groupUnitsIntoEvents(units: ExtractedUnit[]): ExtractedUnit[][] {
    const groups: ExtractedUnit[][] = [];
    const processed = new Set<string>();

    for (const unit of units) {
      if (processed.has(unit.id)) {
        continue;
      }

      // Find related units (same entities, similar time)
      const related = units.filter(u => {
        if (processed.has(u.id) || u.id === unit.id) {
          return false;
        }

        // Check entity overlap
        const entityOverlap = unit.entity_ids.some(id => u.entity_ids.includes(id));
        
        // Check temporal proximity (within 24 hours)
        const timeDiff = this.getTimeDifference(unit, u);
        const isTemporalProximal = timeDiff < 24 * 60 * 60 * 1000; // 24 hours in ms

        return entityOverlap && isTemporalProximal;
      });

      // Create group
      const group = [unit, ...related];
      group.forEach(u => processed.add(u.id));
      groups.push(group);
    }

    return groups;
  }

  /**
   * Get time difference between units (in milliseconds)
   */
  private getTimeDifference(unit1: ExtractedUnit, unit2: ExtractedUnit): number {
    const time1 = unit1.temporal_context?.start_time || unit1.created_at;
    const time2 = unit2.temporal_context?.start_time || unit2.created_at;
    
    const date1 = new Date(time1).getTime();
    const date2 = new Date(time2).getTime();
    
    return Math.abs(date1 - date2);
  }

  /**
   * Create or update event from unit group
   * If units are linked to an existing event, update that event instead
   */
  private async createOrUpdateEvent(
    userId: string,
    unitGroup: ExtractedUnit[]
  ): Promise<EventAssemblyResult> {
    // Check if any units are already linked to an event
    const linkedEventIds = new Set<string>();
    for (const unit of unitGroup) {
      const { data: links } = await supabaseAdmin
        .from('event_unit_links')
        .select('event_id')
        .eq('unit_id', unit.id)
        .limit(1);
      
      if (links && links.length > 0) {
        linkedEventIds.add(links[0].event_id);
      }
    }

    // If units are linked to an existing event, update that event
    if (linkedEventIds.size === 1) {
      const eventId = Array.from(linkedEventIds)[0];
      return await this.updateExistingEvent(userId, eventId, unitGroup);
    }
    // Extract event details from units
    const title = this.extractEventTitle(unitGroup);
    const who = this.extractWho(unitGroup);
    const what = this.extractWhat(unitGroup);
    const where = this.extractWhere(unitGroup);
    const when = this.extractWhen(unitGroup);

    // Use omegaMemoryService to create resolved event
    // This integrates with existing event system
    // Use EXPERIENCE units for event assembly (what happened)
    const sourceText = experienceUnits.map(u => u.content).join(' ');

    // Ingest text to extract entities and create event
    const ingestionResult = await omegaMemoryService.ingestText(userId, sourceText, 'AI');

    // Create resolved event
    const { data: event, error } = await supabaseAdmin
      .from('resolved_events')
      .insert({
        user_id: userId,
        title,
        summary: what,
        start_time: when?.start || new Date().toISOString(),
        end_time: when?.end || null,
        people: ingestionResult.entities
          .filter(e => e.type === 'PERSON')
          .map(e => e.id),
        locations: ingestionResult.entities
          .filter(e => e.type === 'LOCATION')
          .map(e => e.id),
        activities: [], // Can be extracted from activities
        confidence: 0.8,
        metadata: {
          assembled_from_units: unitGroup.map(u => u.id),
          knowledge_types: {
            experiences: experienceUnits.length,
            facts: factUnits.length,
            beliefs: beliefUnits.length,
            feelings: feelingUnits.length,
          },
        },
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Link knowledge units to event by role
    for (const unit of experienceUnits) {
      const knowledgeUnitId = unit.metadata?.knowledge_unit_id;
      if (knowledgeUnitId) {
        await knowledgeTypeEngineService.linkKnowledgeUnitToEvent(
          userId,
          event.id,
          knowledgeUnitId,
          'what_happened'
        );
      }
    }

    for (const unit of factUnits) {
      const knowledgeUnitId = unit.metadata?.knowledge_unit_id;
      if (knowledgeUnitId) {
        await knowledgeTypeEngineService.linkKnowledgeUnitToEvent(
          userId,
          event.id,
          knowledgeUnitId,
          'fact'
        );
      }
    }

    for (const unit of beliefUnits) {
      const knowledgeUnitId = unit.metadata?.knowledge_unit_id;
      if (knowledgeUnitId) {
        await knowledgeTypeEngineService.linkKnowledgeUnitToEvent(
          userId,
          event.id,
          knowledgeUnitId,
          'interpretation'
        );
      }
    }

    for (const unit of feelingUnits) {
      const knowledgeUnitId = unit.metadata?.knowledge_unit_id;
      if (knowledgeUnitId) {
        await knowledgeTypeEngineService.linkKnowledgeUnitToEvent(
          userId,
          event.id,
          knowledgeUnitId,
          'feeling'
        );
      }
    }

    // Record initial confidence snapshot
    await confidenceTrackingService.recordConfidenceSnapshot(
      userId,
      event.id,
      event.confidence,
      'Event initially assembled from extracted units',
      {
        initial_assembly: true,
        unit_count: unitGroup.length,
      }
    );

    // Re-evaluate beliefs related to this event (BRRE integration)
    // Fire-and-forget: non-blocking
    this.reevaluateBeliefsForEvent(userId, event.id, experienceUnits).catch(err => {
      logger.warn({ error: err, eventId: event.id }, 'Failed to re-evaluate beliefs for event (non-blocking)');
    });

    // Link units to event
    for (const unit of unitGroup) {
      await supabaseAdmin
        .from('event_unit_links')
        .insert({
          event_id: event.id,
          unit_id: unit.id,
        })
        .onConflict('event_id,unit_id')
        .ignore();
    }

    return {
      event_id: event.id,
      title,
      who: who.map(w => w.toString()),
      what,
      where,
      when,
      source_unit_ids: unitGroup.map(u => u.id),
    };
  }

  /**
   * Update existing event with new units (refinement)
   */
  private async updateExistingEvent(
    userId: string,
    eventId: string,
    newUnits: ExtractedUnit[]
  ): Promise<EventAssemblyResult> {
    // Get existing event
    const { data: existingEvent, error: fetchError } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingEvent) {
      throw new Error('Event not found');
    }

    // Get all units linked to this event (including new ones)
    const { data: allLinks } = await supabaseAdmin
      .from('event_unit_links')
      .select('unit_id')
      .eq('event_id', eventId);

    const allUnitIds = new Set<string>([
      ...(allLinks || []).map(l => l.unit_id),
      ...newUnits.map(u => u.id),
    ]);

    // Get all units for this event
    const { data: allUnits } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .in('id', Array.from(allUnitIds))
      .eq('user_id', userId)
      .eq('type', 'EXPERIENCE')
      // Exclude deprecated units
      .not('metadata->>deprecated', 'eq', 'true');

    const validUnits = (allUnits || []).filter(
      unit => !unit.metadata?.deprecated && unit.confidence > 0.2
    );

    // Extract updated event details
    const title = this.extractEventTitle(validUnits);
    const who = this.extractWho(validUnits);
    const what = this.extractWhat(validUnits);
    const where = this.extractWhere(validUnits);
    const when = this.extractWhen(validUnits);

    // Re-ingest to get updated entities
    const sourceText = validUnits.map(u => u.content).join(' ');
    const ingestionResult = await omegaMemoryService.ingestText(userId, sourceText, 'AI');

    // Update event (merge with existing, but prefer new information if confidence is higher)
    const updatedConfidence = Math.min(
      existingEvent.confidence + 0.1, // Slightly increase confidence with refinements
      0.95 // Cap at 95%
    );

    // Track confidence change before updating
    await confidenceTrackingService.trackConfidenceChange(
      userId,
      eventId,
      existingEvent.confidence,
      updatedConfidence,
      { source_unit_ids: existingEvent.metadata?.assembled_from_units || [] },
      { source_unit_ids: validUnits.map(u => u.id) }
    );

    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from('resolved_events')
      .update({
        title, // Update title
        summary: what || existingEvent.summary, // Update summary if available
        start_time: when?.start || existingEvent.start_time,
        end_time: when?.end || existingEvent.end_time,
        people: ingestionResult.entities
          .filter(e => e.type === 'PERSON')
          .map(e => e.id),
        locations: ingestionResult.entities
          .filter(e => e.type === 'LOCATION')
          .map(e => e.id),
        confidence: updatedConfidence,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(existingEvent.metadata || {}),
          assembled_from_units: validUnits.map(u => u.id),
          last_refined_at: new Date().toISOString(),
        },
      })
      .eq('id', eventId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    // Link new units to event
    for (const unit of newUnits) {
      await supabaseAdmin
        .from('event_unit_links')
        .insert({
          event_id: eventId,
          unit_id: unit.id,
        })
        .onConflict('event_id,unit_id')
        .ignore();
    }

    return {
      event_id: updatedEvent.id,
      title,
      who: who.map(w => w.toString()),
      what,
      where,
      when,
      source_unit_ids: validUnits.map(u => u.id),
    };
  }

  /**
   * Reconcile an event with its linked units
   * Called after new units are linked to an event to update event details
   */
  async reconcileEvent(eventId: string, userId: string): Promise<EventAssemblyResult | null> {
    try {
      // Get event
      const { data: event, error: eventError } = await supabaseAdmin
        .from('resolved_events')
        .select('*')
        .eq('id', eventId)
        .eq('user_id', userId)
        .single();

      if (eventError || !event) {
        logger.warn({ eventId, userId, error: eventError }, 'Event not found for reconciliation');
        return null;
      }

      // Get all units linked to this event
      const { data: unitLinks } = await supabaseAdmin
        .from('event_unit_links')
        .select('unit_id')
        .eq('event_id', eventId);

      if (!unitLinks || unitLinks.length === 0) {
        logger.debug({ eventId }, 'No units linked to event for reconciliation');
        return null;
      }

      const unitIds = unitLinks.map(link => link.unit_id);

      // Get all valid units
      const { data: allUnits } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .in('id', unitIds)
        .eq('user_id', userId)
        .eq('type', 'EXPERIENCE')
        .not('metadata->>deprecated', 'eq', 'true');

      const validUnits = (allUnits || []).filter(
        unit => !unit.metadata?.deprecated && !unit.metadata?.pruned && unit.confidence > 0.2
      );

      if (validUnits.length === 0) {
        logger.debug({ eventId }, 'No valid units for reconciliation');
        return null;
      }

      // Derive updated event from units
      const updatedTitle = this.extractEventTitle(validUnits);
      const updatedWho = this.extractWho(validUnits);
      const updatedWhat = this.extractWhat(validUnits);
      const updatedWhere = this.extractWhere(validUnits);
      const updatedWhen = this.extractWhen(validUnits);

      // Check if materially different
      const isMateriallyDifferent =
        updatedTitle !== event.title ||
        updatedWhat !== (event.summary || '') ||
        JSON.stringify(updatedWho) !== JSON.stringify(event.people || []) ||
        JSON.stringify(updatedWhere ? [updatedWhere] : []) !== JSON.stringify(event.locations || []);

      if (!isMateriallyDifferent) {
        logger.debug({ eventId }, 'Event unchanged after reconciliation');
        return {
          event_id: event.id,
          title: event.title,
          who: event.people || [],
          what: event.summary || '',
          where: event.locations?.[0] || null,
          when: { start: event.start_time, end: event.end_time },
          source_unit_ids: unitIds,
        };
      }

      // Re-ingest to get updated entities
      const sourceText = validUnits.map(u => u.content).join(' ');
      const ingestionResult = await omegaMemoryService.ingestText(userId, sourceText, 'AI');

      // Calculate new confidence
      const newConfidence = Math.min(event.confidence + 0.05, 0.95); // Slightly increase confidence

      // Track confidence change before updating
      await confidenceTrackingService.trackConfidenceChange(
        userId,
        eventId,
        event.confidence,
        newConfidence,
        { source_unit_ids: event.metadata?.assembled_from_units || [] },
        { source_unit_ids: validUnits.map(u => u.id) }
      );

      // Update event
      const { data: updatedEvent, error: updateError } = await supabaseAdmin
        .from('resolved_events')
        .update({
          title: updatedTitle,
          summary: updatedWhat || event.summary,
          start_time: updatedWhen?.start || event.start_time,
          end_time: updatedWhen?.end || event.end_time,
          people: ingestionResult.entities
            .filter(e => e.type === 'PERSON')
            .map(e => e.id),
          locations: ingestionResult.entities
            .filter(e => e.type === 'LOCATION')
            .map(e => e.id),
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(event.metadata || {}),
            assembled_from_units: validUnits.map(u => u.id),
            last_reconciled_at: new Date().toISOString(),
          },
        })
        .eq('id', eventId)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      logger.info({ eventId, userId }, 'Event reconciled successfully');

      return {
        event_id: updatedEvent.id,
        title: updatedEvent.title,
        who: updatedEvent.people || [],
        what: updatedEvent.summary || '',
        where: updatedEvent.locations?.[0] || null,
        when: { start: updatedEvent.start_time, end: updatedEvent.end_time },
        source_unit_ids: validUnits.map(u => u.id),
      };
    } catch (error) {
      logger.error({ error, eventId, userId }, 'Failed to reconcile event');
      throw error;
    }
  }

  /**
   * Extract event title from unit group
   */
  private extractEventTitle(units: ExtractedUnit[]): string {
    // Use first unit's content as base, or generate from entities
    if (units.length === 0) {
      return 'Untitled Event';
    }

    const firstContent = units[0].content;
    // Simple extraction - can be enhanced with LLM
    const sentences = firstContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences[0]?.trim().substring(0, 100) || 'Untitled Event';
  }

  /**
   * Extract WHO from unit group
   */
  private extractWho(units: ExtractedUnit[]): string[] {
    const allEntityIds = new Set<string>();
    units.forEach(u => u.entity_ids.forEach(id => allEntityIds.add(id)));
    return Array.from(allEntityIds);
  }

  /**
   * Extract WHAT from unit group
   */
  private extractWhat(units: ExtractedUnit[]): string {
    return units.map(u => u.content).join(' ');
  }

  /**
   * Extract WHERE from unit group
   */
  private extractWhere(units: ExtractedUnit[]): string | null {
    // Extract location from temporal_context or content
    for (const unit of units) {
      if (unit.temporal_context?.location) {
        return unit.temporal_context.location as string;
      }
    }
    return null;
  }

  /**
   * Extract WHEN from unit group
   */
  private extractWhen(units: ExtractedUnit[]): { start: string; end: string | null } | null {
    const times = units
      .map(u => u.temporal_context?.start_time || u.created_at)
      .filter(Boolean)
      .map(t => new Date(t as string).getTime())
      .sort((a, b) => a - b);

    if (times.length === 0) {
      return null;
    }

    return {
      start: new Date(times[0]).toISOString(),
      end: times.length > 1 ? new Date(times[times.length - 1]).toISOString() : null,
    };
  }
}

export const eventAssemblyService = new EventAssemblyService();


// =====================================================
// EVENT ASSEMBLY SERVICE
// Purpose: Assemble structured events from extracted units
// =====================================================

import { logger } from '../../logger';
import { occurrenceSortMs } from '../../utils/temporalOccurrence';
import type { ExtractedUnit, EventAssemblyResult } from '../../types/conversationCentered';
import { beliefRealityReconciliationService } from '../beliefRealityReconciliationService';
import { confidenceTrackingService } from '../confidenceTrackingService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import { metaControlService } from '../metaControlService';
import { omegaMemoryService } from '../omegaMemoryService';
import { ruleBasedTitleGenerationService } from '../ruleBasedTitleGeneration';
import { supabaseAdmin } from '../supabaseClient';
import { resolveAllTemporalAnchors, resolveAllTemporalAnchorsInTimezone, resolveChronoWindows } from '../../utils/temporalAnchorResolver';
import {
  chooseTemporal,
  classifyTemporalExpression,
  evidenceClassRank,
  statusFor,
  type TemporalEvidence,
  type TemporalPrecision,
} from '../temporal/temporalEvidence';
import { getUserTimezone } from '../temporal/userTimezoneService';

interface EventAssemblyOptions {
  windowDays?: number;
}

interface AssembledWhen {
  start: string;
  end: string | null;
  label?: string;
  confidence?: number;
  precision?: string;
  source?: 'temporal_context' | 'content_inference' | 'created_at';
}

type UserPresence = 'attended' | 'heard_about' | 'unknown';

function inferUserPresence(unitGroup: ExtractedUnit[]): UserPresence {
  const text = unitGroup.map(u => u.content).join(' ').toLowerCase();
  if (
    /\b(heard about|couldn't make|could not make|missed the|find out that|told me about|wish i could|didn't go|did not go|wasn't at|was not at|couldn't attend|could not attend|they had a|she had a|he had a without me)\b/.test(
      text
    )
  ) {
    return 'heard_about';
  }
  if (
    /\b(i went|i was at|we went|i attended|i drove|i arrived|i stayed|i met|i saw|i hung|i celebrated|we were at|i'm at|i am at|my cousin|my friend|yesterday i|today i|last night i)\b/.test(
      text
    )
  ) {
    return 'attended';
  }
  if (unitGroup.some(u => u.type === 'EXPERIENCE')) return 'attended';
  return 'unknown';
}

/**
 * Assembles structured events from EXPERIENCE units
 */
export class EventAssemblyService {
  /**
   * Assemble events from extracted units
   * Groups EXPERIENCE units by WHO/WHERE/WHEN
   */
  async assembleEvents(userId: string, threadId?: string, options: EventAssemblyOptions = {}): Promise<EventAssemblyResult[]> {
    try {
      // Load only recent EXPERIENCE units — units older than this window were already
      // assembled in a prior run. Loading all history is O(n_lifetime) per message,
      // which becomes catastrophic for long-term users.
      const ASSEMBLY_WINDOW_DAYS = Math.min(Math.max(options.windowDays ?? 30, 1), 3650);
      const windowStart = new Date(Date.now() - ASSEMBLY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: allUnits, error } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'EXPERIENCE')
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      // Filter out deprecated and pruned units
      // Also filter out AI interpretations (they shouldn't create events)
      const experienceUnits = (allUnits || []).filter(
        unit =>
          !unit.metadata?.deprecated &&
          !unit.metadata?.pruned &&
          unit.metadata?.source !== 'ai_interpretation' &&
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
        const event = await this.createOrUpdateEvent(userId, group, threadId);
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
    // Consume occurrence bounds (occurred_before/after) — not just start_time — so
    // a "before the move" unit clusters near the move instead of its recorded date.
    const date1 = occurrenceSortMs(unit1.temporal_context, unit1.created_at);
    const date2 = occurrenceSortMs(unit2.temporal_context, unit2.created_at);
    return Math.abs(date1 - date2);
  }

  /**
   * Create or update event from unit group
   * If units are linked to an existing event, update that event instead
   */
  private async createOrUpdateEvent(
    userId: string,
    unitGroup: ExtractedUnit[],
    threadId?: string
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
    const timezone = await getUserTimezone(userId);
    const when = this.extractWhen(unitGroup, timezone);
    const evidence = this.whenToEvidence(when, timezone);
    const userPresence = inferUserPresence(unitGroup);

    // Group units by knowledge type.
    // units (what happened); fall back to the whole group when a cluster has
    // no EXPERIENCE units so entity extraction still gets source text.
    const experienceUnits = unitGroup.filter(u => u.type === 'EXPERIENCE');
    const factUnits = unitGroup.filter(u => u.type === 'CLAIM');
    const beliefUnits = unitGroup.filter(u => u.type === 'PERCEPTION');
    const feelingUnits = unitGroup.filter(u => u.type === 'FEELING');

    const sourceText = (experienceUnits.length > 0 ? experienceUnits : unitGroup)
      .map(u => u.content)
      .join(' ');

    // Ingest text to extract entities and create event
    const ingestionResult = await omegaMemoryService.ingestText(userId, sourceText, 'AI');

    // Replay-safe fingerprint from knowledge unit ids (stable across re-assembly).
    const { buildAssemblyFingerprint, EVENT_EXTRACTOR_VERSION } = await import(
      '../events/eventSourceIdentity'
    );
    const sourceFingerprint = buildAssemblyFingerprint({
      userId,
      unitIds: unitGroup.map((u) => u.id).filter(Boolean),
    });
    const { data: existingByFp } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .eq('source_fingerprint', sourceFingerprint)
      .maybeSingle();
    if (existingByFp?.id) {
      return existingByFp as typeof existingByFp;
    }

    // Create resolved event
    const { data: event, error } = await supabaseAdmin
      .from('resolved_events')
      .insert({
        user_id: userId,
        title,
        summary: what,
        // Recording time never masquerades as event time: unanchored events
        // keep start_time null; created_at holds when it was recorded.
        start_time: evidence.start,
        end_time: evidence.end,
        timezone: evidence.timezone,
        temporal_precision: evidence.precision,
        temporal_source: evidence.source,
        temporal_confidence: evidence.confidence,
        temporal_expression: evidence.expression,
        temporal_status: evidence.status,
        people: ingestionResult.entities
          .filter(e => e.type === 'PERSON')
          .map(e => e.id),
        locations: ingestionResult.entities
          .filter(e => e.type === 'LOCATION')
          .map(e => e.id),
        activities: [], // Can be extracted from activities
        confidence: 0.8,
        source_fingerprint: sourceFingerprint,
        extractor_version: EVENT_EXTRACTOR_VERSION,
        metadata: {
          assembled_from_units: unitGroup.map(u => u.id),
          user_presence: userPresence,
          ...(threadId ? { thread_id: threadId } : {}),
          knowledge_types: {
            experiences: experienceUnits.length,
            facts: factUnits.length,
            beliefs: beliefUnits.length,
            feelings: feelingUnits.length,
          },
          temporal: when
            ? {
                label: when.label || null,
                confidence: when.confidence ?? null,
                precision: when.precision || null,
                source: when.source || null,
              }
            : null,
        },
      })
      .select('*')
      .single();

    if (error) {
      if (/duplicate|unique/i.test(error.message ?? '')) {
        const { data: raced } = await supabaseAdmin
          .from('resolved_events')
          .select('*')
          .eq('user_id', userId)
          .eq('source_fingerprint', sourceFingerprint)
          .maybeSingle();
        if (raced?.id) return raced as typeof raced;
      }
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

    // NOTE: a per-event BRRE re-evaluation hook used to be called here, but the
    // method never existed and the call crashed all event assembly. Belief
    // re-evaluation runs via beliefRealityReconciliationService.reevaluateAllBeliefs
    // on its own cadence instead of per assembled event.

    // Link units to event. upsert with ignoreDuplicates is the supabase-js v2
    // form — .insert().onConflict().ignore() does not exist and throws.
    for (const unit of unitGroup) {
      await supabaseAdmin
        .from('event_unit_links')
        .upsert(
          { event_id: event.id, unit_id: unit.id },
          { onConflict: 'event_id,unit_id', ignoreDuplicates: true }
        );
    }

    // ── Phase C1: Link nearby event_records to this resolved_event ─────────────
    // This is the primary mechanism for establishing the explicit FK between the
    // Mode Router system (event_records) and the Temporal Assembler system
    // (resolved_events). Previously these were connected only by date approximation.
    //
    // Window: ±1 day around the event's start_time. The ±1 catches:
    //   - Next-day journaling ("let me tell you about yesterday")
    //   - Timezone edge cases where UTC date differs from local date
    //   - Events that span midnight
    //
    // IS NULL guard: never overwrite an existing explicit link. Application-layer
    // links (set by Phase C2 or Phase D once implemented) are always preserved.
    //
    // Non-blocking: fires and does not throw — assembly behavior is unchanged
    // if this step fails.
    ;(async () => {
      try {
        const eventStartDate = new Date(event.start_time);
        const windowStart = new Date(eventStartDate);
        windowStart.setDate(windowStart.getDate() - 1);
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date(eventStartDate);
        windowEnd.setDate(windowEnd.getDate() + 1);
        windowEnd.setHours(23, 59, 59, 999);

        await supabaseAdmin
          .from('event_records')
          .update({ resolved_event_id: event.id })
          .eq('user_id', userId)
          .is('resolved_event_id', null)              // never overwrite explicit links
          .gte('event_date', windowStart.toISOString())
          .lte('event_date', windowEnd.toISOString())
          .select('id');

        logger.debug(
          { userId, eventId: event.id, mechanism: 'assembly' },
          'Attempted event_records linkage after assembly'
        );
      } catch (err) {
        logger.debug({ err, eventId: event.id, userId }, 'event_records linking failed (non-blocking)');
      }
    })();

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
    const title = this.chooseBetterEventTitle(existingEvent.title, this.extractEventTitle(validUnits));
    const who = this.extractWho(validUnits);
    const what = this.extractWhat(validUnits);
    const where = this.extractWhere(validUnits);
    const timezone = await getUserTimezone(userId);
    const when = this.extractWhen(validUnits, timezone);
    const userPresence = inferUserPresence(validUnits);

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
        // Precedence-aware: new evidence only replaces a LOWER class.
        ...this.evidencePatch(
          chooseTemporal(this.rowEvidence(existingEvent), this.whenToEvidence(when, timezone)),
        ),
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
          user_presence: userPresence,
          last_refined_at: new Date().toISOString(),
          temporal: when
            ? {
                label: when.label || null,
                confidence: when.confidence ?? null,
                precision: when.precision || null,
                source: when.source || null,
              }
            : existingEvent.metadata?.temporal || null,
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
        .upsert(
          { event_id: eventId, unit_id: unit.id },
          { onConflict: 'event_id,unit_id', ignoreDuplicates: true }
        );
    }

    // ── Phase C1: Link nearby event_records to this resolved_event ─────────────
    // Same logic as in createOrUpdateEvent — applied on refinement/update so that
    // new event_records created between the original assembly and this refinement
    // also get linked. IS NULL guard ensures no explicit links are overwritten.
    ;(async () => {
      try {
        const eventStartDate = new Date(updatedEvent.start_time);
        const windowStart = new Date(eventStartDate);
        windowStart.setDate(windowStart.getDate() - 1);
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date(eventStartDate);
        windowEnd.setDate(windowEnd.getDate() + 1);
        windowEnd.setHours(23, 59, 59, 999);

        await supabaseAdmin
          .from('event_records')
          .update({ resolved_event_id: updatedEvent.id })
          .eq('user_id', userId)
          .is('resolved_event_id', null)
          .gte('event_date', windowStart.toISOString())
          .lte('event_date', windowEnd.toISOString())
          .select('id');

        logger.debug(
          { userId, eventId: updatedEvent.id, mechanism: 'assembly_refinement' },
          'Attempted event_records linkage after refinement'
        );
      } catch (err) {
        logger.debug({ err, eventId: updatedEvent.id, userId }, 'event_records linking failed on refinement (non-blocking)');
      }
    })();

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
      const updatedTitle = this.chooseBetterEventTitle(event.title, this.extractEventTitle(validUnits));
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
          ...this.evidencePatch(
            chooseTemporal(
              this.rowEvidence(event),
              this.whenToEvidence(updatedWhen, await getUserTimezone(userId)),
            ),
          ),
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
            temporal: updatedWhen
              ? {
                  label: updatedWhen.label || null,
                  confidence: updatedWhen.confidence ?? null,
                  precision: updatedWhen.precision || null,
                  source: updatedWhen.source || null,
                }
              : event.metadata?.temporal || null,
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
    // Contextual title from unit content — never "Untitled Event"
    const source = units.map(u => u.content).join(' ').trim();
    if (source.length > 0) {
      const eventSpecificTitle = this.inferEventTitleFromContent(source);
      if (eventSpecificTitle) return eventSpecificTitle;

      const generated = ruleBasedTitleGenerationService.generateTitle(source);
      if (generated && generated.length >= 8 && !this.isWeakEventTitle(generated)) return generated;
      const sentences = this.cleanEventSourceText(source).split(/[.!?]+/).filter(s => s.trim().length > 0);
      const firstSentence = sentences.find(sentence => !this.isWeakEventTitle(sentence))?.trim().substring(0, 100);
      if (firstSentence) return firstSentence;
    }
    return 'Captured Conversation';
  }

  private inferEventTitleFromContent(source: string): string | null {
    const text = source.replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();

    if (/\bex lover(?:\s+show)?\b/.test(lower)) return 'Ex Lover Show';
    if (/\b(testing|tested|trying|tried)\s+lore\s*book\b/.test(lower)) return 'Testing LoreBook';
    if (/\b(testing|tested|trying|tried)\s+lorebook\b/.test(lower)) return 'Testing LoreBook';

    const interviewNames = this.extractNamesAfterConnector(text, /\binterviews?\s+(?:with\s+)?/i);
    if (interviewNames.length > 0) return `Interview with ${this.joinNames(interviewNames)}`;

    const runAtMatch = text.match(/\b(?:i\s+)?(?:ran|run|running|jogged|walked)\b[^.!?]{0,80}\b(?:at|in|around)\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,4}\s+(?:Park|Trail|Beach|Gym|Field|Center|Square))/);
    if (runAtMatch?.[1]) return `Run at ${runAtMatch[1].trim()}`;
    if (/\bsquare mile park\b/i.test(text) && /\b(ran|run|running|jogged|walked)\b/i.test(text)) return 'Run at Square Mile Park';

    const visitHouseholdMatch = text.match(/\bvisit(?:ed|ing)?\b[^.!?]{0,100}\b(?:my\s+)?(Tia\s+[A-Z][\w'.-]+|Aunt\s+[A-Z][\w'.-]+|[A-Z][\w'.-]+)'?s?\s+(?:household|house|home)\b/i);
    if (visitHouseholdMatch?.[1]) {
      return `Visit to ${visitHouseholdMatch[1].replace(/^my\s+/i, '').trim()}'s Household`;
    }

    const showMatch = text.match(/\b(?:went\s+to|attended|saw|played|performed\s+at)\s+(?:the\s+)?(?:\"([^\"]{3,80})\"|'([^']{3,80})'|([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,5}))\s+(?:show|concert|gig|festival)\b/);
    const showName = showMatch?.[1] || showMatch?.[2] || showMatch?.[3];
    if (showName) return `${showName.trim()} Show`;

    return null;
  }

  private extractNamesAfterConnector(source: string, connector: RegExp): string[] {
    const match = source.match(connector);
    if (!match?.index && match?.index !== 0) return [];
    const rest = source.slice(match.index + match[0].length).split(/[.!?]/)[0] || '';
    return rest
      .split(/\s*(?:,|and|&)\s*/i)
      .map(part => part.trim())
      .filter(part => /^[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}$/.test(part))
      .slice(0, 4);
  }

  private joinNames(names: string[]): string {
    if (names.length <= 1) return names[0] || 'Someone';
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }

  private chooseBetterEventTitle(existingTitle: string | null | undefined, candidateTitle: string): string {
    if (this.isWeakEventTitle(candidateTitle)) {
      return existingTitle && !this.isWeakEventTitle(existingTitle) ? existingTitle : 'Captured Conversation';
    }

    if (existingTitle && !this.isWeakEventTitle(existingTitle)) {
      const candidateWords = candidateTitle.split(/\s+/).filter(Boolean).length;
      const existingWords = existingTitle.split(/\s+/).filter(Boolean).length;
      if (candidateWords < 3 && existingWords >= 3) return existingTitle;
    }

    return candidateTitle;
  }

  private isWeakEventTitle(title: string | null | undefined): boolean {
    const value = title?.trim();
    if (!value) return true;
    return [
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/i,
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/i,
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?$/i,
      /^(chat|conversation|journal entry|entry|memory|event|moment)$/i,
      /^(chat|conversation|journal entry|entry|memory|event|moment)\s*(from|on|for)?\s*[:\-–—]?\s*(\d|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i,
    ].some(pattern => pattern.test(value));
  }

  private cleanEventSourceText(source: string): string {
    return source
      .replace(/\b(user|assistant|system|summary|content|date)\s*:\s*/gi, ' ')
      .replace(/^(hi|hey|hello|yo|so|okay|ok|um|well)[,!.\s]+/i, '')
      .replace(/^(today|yesterday|tonight|this morning|this afternoon|this evening)\s*,?\s*/i, '')
      .replace(/^(i|we)\s+(talked|spoke|chatted|were talking)\s+(about|with)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
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
  private extractWhen(units: ExtractedUnit[], timezone: string = 'UTC'): AssembledWhen | null {
    const sourceText = units.map(u => u.content).join(' ');
    const referenceDate = this.getEarliestCreatedAt(units) || new Date();
    const contentAnchor = resolveAllTemporalAnchorsInTimezone(sourceText, referenceDate, timezone);

    const contextWindows = units
      .map(unit => {
        const tc = unit.temporal_context;
        const explicit = tc?.start_time ? new Date(tc.start_time).getTime() : NaN;
        const hasExplicit = Number.isFinite(explicit);
        // Bounded-only units ("before the move") still position the event — at low
        // confidence, so any explicitly-dated unit in the group always wins.
        const hasBound = !hasExplicit && Boolean(tc?.occurred_before || tc?.occurred_after);
        const startTime = hasExplicit ? explicit : hasBound ? occurrenceSortMs(tc, unit.created_at) : NaN;
        if (!Number.isFinite(startTime)) return null;
        return {
          start: startTime,
          end: tc?.end_time ? new Date(tc.end_time).getTime() : null,
          confidence: hasBound
            ? Math.min(0.3, typeof tc?.confidence === 'number' ? tc.confidence : 0.3)
            : (typeof tc?.confidence === 'number' ? tc.confidence : 0.7),
          label: tc?.label || tc?.original_text || tc?.relative_to_event,
          precision: tc?.precision,
          isCurrentFallback: tc?.source === 'current_time',
        };
      })
      .filter((window): window is NonNullable<typeof window> => Boolean(window))
      .sort((a, b) => a.start - b.start);

    // Recording-derived windows (source 'current_time') are NOT evidence of
    // when something happened — they never anchor an event on their own.
    const bestContext = contextWindows.find(window => !window.isCurrentFallback) ?? null;

    // Candidates from all resolvers, ranked by EVIDENCE CLASS of the wording
    // (a stated calendar date outranks "last night" regardless of scores),
    // confidence breaking ties only within a class.
    type Cand = { start: string; end: string | null; label?: string; confidence: number; precision?: string; rank: number };
    const rankOf = (label: string | undefined | null) => {
      const cls = classifyTemporalExpression(label ?? '');
      return evidenceClassRank({ start: 'x', source: cls.source, precision: cls.precision });
    };
    const candidates: Cand[] = [];
    for (const w of resolveChronoWindows(sourceText, referenceDate, timezone)) {
      candidates.push({
        start: w.start.toISOString(), end: w.end.toISOString(),
        label: w.label, confidence: w.confidence, precision: w.precision,
        rank: rankOf(w.label),
      });
    }
    if (contentAnchor) {
      candidates.push({
        start: contentAnchor.start.toISOString(), end: contentAnchor.end.toISOString(),
        label: contentAnchor.label, confidence: contentAnchor.confidence, precision: contentAnchor.precision,
        rank: rankOf(contentAnchor.label ?? sourceText),
      });
    }
    if (bestContext) {
      candidates.push({
        start: new Date(bestContext.start).toISOString(),
        end: bestContext.end && Number.isFinite(bestContext.end) ? new Date(bestContext.end).toISOString() : null,
        label: typeof bestContext.label === 'string' ? bestContext.label : undefined,
        confidence: bestContext.confidence,
        precision: typeof bestContext.precision === 'string' ? bestContext.precision : undefined,
        rank: rankOf(typeof bestContext.label === 'string' ? bestContext.label : ''),
      });
    }
    candidates.sort((a, b) => b.rank - a.rank || b.confidence - a.confidence);
    const bestCandidate = candidates[0];
    if (bestCandidate) {
      return {
        start: bestCandidate.start,
        end: bestCandidate.end,
        label: bestCandidate.label,
        confidence: bestCandidate.confidence,
        precision: bestCandidate.precision,
        source: 'content_inference',
      };
    }

    // No temporal evidence: the event stays UNANCHORED. Recording time must
    // never masquerade as event time — created_at remains available separately.
    return null;
  }



  /** Existing row → evidence (legacy rows read as recording_fallback). */
  private rowEvidence(row: {
    start_time?: string | null; end_time?: string | null; timezone?: string | null;
    temporal_precision?: string | null; temporal_source?: string | null;
    temporal_confidence?: number | null; temporal_expression?: string | null;
    temporal_status?: string | null;
  }): TemporalEvidence {
    return {
      start: row.start_time ?? null,
      end: row.end_time ?? null,
      timezone: row.timezone ?? null,
      precision: (row.temporal_precision as TemporalEvidence['precision']) ?? 'unknown',
      source: (row.temporal_source as TemporalEvidence['source']) ?? 'recording_fallback',
      status: (row.temporal_status as TemporalEvidence['status']) ?? 'unanchored',
      confidence: row.temporal_confidence ?? 0,
      expression: row.temporal_expression ?? null,
    };
  }

  private evidencePatch(e: TemporalEvidence) {
    return {
      start_time: e.start,
      end_time: e.end,
      timezone: e.timezone,
      temporal_precision: e.precision,
      temporal_source: e.source,
      temporal_confidence: e.confidence,
      temporal_expression: e.expression,
      temporal_status: e.status,
    };
  }

  /** Map resolver precision names to the canonical TemporalPrecision. */
  private toTemporalPrecision(p: string | undefined): TemporalPrecision {
    switch (p) {
      case 'hour': case 'minute': return 'time_of_day';
      case 'day': case 'week': return 'date';
      case 'month': return 'month';
      case 'season': return 'season';
      case 'year': return 'year';
      default: return 'unknown';
    }
  }

  /** Canonical evidence record for an assembled when (or unanchored). */
  private whenToEvidence(when: AssembledWhen | null, timezone: string): TemporalEvidence {
    if (!when?.start) {
      return {
        start: null, end: null, timezone,
        precision: 'unknown', source: 'recording_fallback', status: 'unanchored',
        confidence: 0, expression: null,
      };
    }
    const cls = classifyTemporalExpression(when.label ?? null);
    const precision = when.precision ? this.toTemporalPrecision(when.precision) : cls.precision;
    const base = {
      start: when.start,
      end: when.end ?? null,
      timezone,
      precision,
      source: cls.source,
      confidence: typeof when.confidence === 'number' ? when.confidence : 0.5,
      expression: when.label ?? null,
    };
    return { ...base, status: statusFor(base) };
  }

  private getEarliestCreatedAt(units: ExtractedUnit[]): Date | null {
    const timestamps = units
      .map(unit => new Date(unit.created_at).getTime())
      .filter(timestamp => Number.isFinite(timestamp))
      .sort((a, b) => a - b);

    return timestamps.length > 0 ? new Date(timestamps[0]) : null;
  }
}

export const eventAssemblyService = new EventAssemblyService();

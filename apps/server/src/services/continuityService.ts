/**
 * LORE-KEEPER EXPLAINABILITY & META CONTINUITY LAYER
 * Service for tracking, explaining, and reversing system actions
 */

import { logger } from '../logger';
import type {
  ContinuityEvent,
  ReversalLog,
  EventExplanation,
  ContinuityEventInput,
  EntityMergeData,
  TimelineSegmentData,
  NarrativeTransitionData,
  InitiatedBy,
  Severity,
} from '../types/continuity';

import { supabaseAdmin } from './supabaseClient';

export class ContinuityService {
  /**
   * Emit a continuity event
   */
  async emitEvent(
    userId: string,
    eventData: ContinuityEventInput
  ): Promise<ContinuityEvent> {
    try {
      const event: Partial<ContinuityEvent> = {
        user_id: userId,
        type: eventData.type,
        context: eventData.context,
        explanation: eventData.explanation,
        related_claim_ids: eventData.related_claim_ids || [],
        related_entity_ids: eventData.related_entity_ids || [],
        related_location_ids: eventData.related_location_ids || [],
        initiated_by: eventData.initiated_by || 'SYSTEM',
        severity: eventData.severity || 'INFO',
        reversible: eventData.reversible ?? false,
      };

      const { data, error } = await supabaseAdmin
        .from('continuity_events')
        .insert(event)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, eventType: eventData.type }, 'Failed to emit continuity event');
        throw error;
      }

      // Push notification if severity is ALERT
      if (eventData.severity === 'ALERT') {
        // TODO: Implement notification system
        logger.warn({ eventId: data.id, userId }, 'ALERT severity event - notification should be sent');
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to emit continuity event');
      throw error;
    }
  }

  /**
   * Record claim creation
   */
  async recordClaimCreation(
    userId: string,
    claim: any,
    sourceText: string,
    entity: any
  ): Promise<ContinuityEvent> {
    const excerpt = sourceText.length > 100 
      ? sourceText.substring(0, 100) + '...' 
      : sourceText;

    const explanation = `Claim created about ${entity.primary_name} from input: "${excerpt}"`;

    return this.emitEvent(userId, {
      type: 'CLAIM_CREATED',
      context: {
        claim: {
          id: claim.id,
          text: claim.text,
          confidence: claim.confidence,
        },
        sourceText: excerpt,
        entity: {
          id: entity.id,
          primary_name: entity.primary_name,
          type: entity.type,
        },
      },
      explanation,
      related_claim_ids: [claim.id],
      related_entity_ids: [entity.id],
      initiated_by: 'USER',
      severity: 'INFO',
      reversible: true,
    });
  }

  /**
   * Record contradiction detection
   */
  async recordContradiction(
    userId: string,
    claimA: any,
    claimB: any
  ): Promise<ContinuityEvent> {
    const explanation = `Contradiction detected between claim "${claimA.text?.substring(0, 50)}..." and claim "${claimB.text?.substring(0, 50)}..."`;

    return this.emitEvent(userId, {
      type: 'CONTRADICTION_FOUND',
      context: {
        claimA: {
          id: claimA.id,
          text: claimA.text,
          confidence: claimA.confidence,
        },
        claimB: {
          id: claimB.id,
          text: claimB.text,
          confidence: claimB.confidence,
        },
      },
      explanation,
      related_claim_ids: [claimA.id, claimB.id],
      related_entity_ids: claimA.entity_id === claimB.entity_id ? [claimA.entity_id] : [],
      severity: 'WARNING',
      reversible: false,
    });
  }

  /**
   * Record entity merge
   */
  async recordEntityMerge(
    userId: string,
    mergeData: EntityMergeData
  ): Promise<ContinuityEvent> {
    const explanation = `Entity merge: ${mergeData.source_entity.primary_name} into ${mergeData.target_entity.primary_name}`;

    return this.emitEvent(userId, {
      type: 'ENTITY_MERGED',
      context: {
        source_entity: mergeData.source_entity,
        target_entity: mergeData.target_entity,
        merged_claim_ids: mergeData.merged_claim_ids,
      },
      explanation,
      related_entity_ids: [mergeData.source_entity_id, mergeData.target_entity_id],
      related_claim_ids: mergeData.merged_claim_ids,
      initiated_by: 'USER',
      severity: 'INFO',
      reversible: true,
    });
  }

  /**
   * Record timeline segmentation
   */
  async recordTimelineSegment(
    userId: string,
    entity: any,
    segmentData: TimelineSegmentData
  ): Promise<ContinuityEvent> {
    const explanation = `Segmented timeline for ${entity.primary_name} into ${segmentData.segments.length} segments`;

    return this.emitEvent(userId, {
      type: 'TIMELINE_SEGMENTED',
      context: {
        entity: {
          id: entity.id,
          primary_name: entity.primary_name,
        },
        segments: segmentData.segments,
      },
      explanation,
      related_entity_ids: [entity.id],
      severity: 'INFO',
      reversible: false,
    });
  }

  /**
   * Record narrative transition
   */
  async recordNarrativeTransition(
    userId: string,
    entity: any,
    transitionData: NarrativeTransitionData
  ): Promise<ContinuityEvent> {
    const explanation = `Narrative transition detected for ${entity.primary_name}: ${transitionData.arc_change.from} → ${transitionData.arc_change.to}`;

    return this.emitEvent(userId, {
      type: 'NARRATIVE_TRANSITION',
      context: {
        entity: {
          id: entity.id,
          primary_name: entity.primary_name,
        },
        arc_change: transitionData.arc_change,
      },
      explanation,
      related_entity_ids: [entity.id],
      severity: 'INFO',
      reversible: true,
    });
  }

  /**
   * Record claim update
   */
  async recordClaimUpdate(
    userId: string,
    claim: any,
    previousState: any,
    reason?: string
  ): Promise<ContinuityEvent> {
    const explanation = reason || `Claim updated: "${claim.text?.substring(0, 50)}..."`;

    return this.emitEvent(userId, {
      type: 'CLAIM_UPDATED',
      context: {
        claim: {
          id: claim.id,
          text: claim.text,
          confidence: claim.confidence,
        },
        previous_state: previousState,
        reason,
      },
      explanation,
      related_claim_ids: [claim.id],
      related_entity_ids: claim.entity_id ? [claim.entity_id] : [],
      initiated_by: 'USER',
      severity: 'INFO',
      reversible: true,
    });
  }

  /**
   * Record claim ended
   */
  async recordClaimEnded(
    userId: string,
    claim: any,
    reason?: string
  ): Promise<ContinuityEvent> {
    const explanation = reason || `Claim ended: "${claim.text?.substring(0, 50)}..."`;

    return this.emitEvent(userId, {
      type: 'CLAIM_ENDED',
      context: {
        claim: {
          id: claim.id,
          text: claim.text,
        },
        reason,
      },
      explanation,
      related_claim_ids: [claim.id],
      related_entity_ids: claim.entity_id ? [claim.entity_id] : [],
      initiated_by: 'SYSTEM',
      severity: 'INFO',
      reversible: true,
    });
  }

  /**
   * Record entity resolution
   */
  async recordEntityResolved(
    userId: string,
    entity: any,
    resolutionMethod: 'exact_match' | 'alias_match' | 'semantic_match'
  ): Promise<ContinuityEvent> {
    const explanation = `Entity resolved: ${entity.primary_name} (${resolutionMethod})`;

    return this.emitEvent(userId, {
      type: 'ENTITY_RESOLVED',
      context: {
        entity: {
          id: entity.id,
          primary_name: entity.primary_name,
          type: entity.type,
        },
        resolution_method: resolutionMethod,
      },
      explanation,
      related_entity_ids: [entity.id],
      initiated_by: 'SYSTEM',
      severity: 'INFO',
      reversible: false,
    });
  }

  /**
   * Record continuity alert
   */
  async recordContinuityAlert(
    userId: string,
    alertMessage: string,
    context: Record<string, any>,
    relatedIds?: {
      claim_ids?: string[];
      entity_ids?: string[];
      location_ids?: string[];
    }
  ): Promise<ContinuityEvent> {
    return this.emitEvent(userId, {
      type: 'CONTINUITY_ALERT',
      context,
      explanation: alertMessage,
      related_claim_ids: relatedIds?.claim_ids || [],
      related_entity_ids: relatedIds?.entity_ids || [],
      related_location_ids: relatedIds?.location_ids || [],
      initiated_by: 'SYSTEM',
      severity: 'ALERT',
      reversible: false,
    });
  }

  /**
   * Get event explanation with related context
   */
  async explainEvent(eventId: string, userId: string): Promise<EventExplanation | null> {
    try {
      const { data: event, error } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('id', eventId)
        .eq('user_id', userId)
        .single();

      if (error || !event) {
        logger.error({ err: error, eventId, userId }, 'Failed to get event');
        return null;
      }

      // Fetch related context
      const relatedContext: any = {};

      // Fetch related claims
      if (event.related_claim_ids && event.related_claim_ids.length > 0) {
        const { data: claims } = await supabaseAdmin
          .from('omega_claims')
          .select('id, text, confidence, start_time, is_active')
          .in('id', event.related_claim_ids);
        relatedContext.claims = claims || [];
      }

      // Fetch related entities
      if (event.related_entity_ids && event.related_entity_ids.length > 0) {
        const { data: entities } = await supabaseAdmin
          .from('omega_entities')
          .select('id, primary_name, type')
          .in('id', event.related_entity_ids);
        relatedContext.entities = entities || [];
      }

      // Fetch related locations (if locations table exists)
      if (event.related_location_ids && event.related_location_ids.length > 0) {
        // TODO: Fetch from locations table when available
        relatedContext.locations = [];
      }

      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        explanation: event.explanation,
        context: event.context,
        reversible: event.reversible,
        severity: event.severity,
        initiated_by: event.initiated_by,
        related_claim_ids: event.related_claim_ids,
        related_entity_ids: event.related_entity_ids,
        related_location_ids: event.related_location_ids,
        related_context: relatedContext,
      };
    } catch (error) {
      logger.error({ err: error, eventId, userId }, 'Failed to explain event');
      return null;
    }
  }

  /**
   * List continuity events with filters
   */
  async listEvents(
    userId: string,
    filters?: {
      type?: string;
      severity?: Severity;
      reversible?: boolean;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ContinuityEvent[]> {
    try {
      let query = supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters?.reversible !== undefined) {
        query = query.eq('reversible', filters.reversible);
      }

      if (filters?.start_date) {
        query = query.gte('timestamp', filters.start_date);
      }

      if (filters?.end_date) {
        query = query.lte('timestamp', filters.end_date);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId, filters }, 'Failed to list events');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to list continuity events');
      throw error;
    }
  }

  /**
   * Revert an event (if reversible)
   */
  async revertEvent(
    userId: string,
    eventId: string,
    reason: string
  ): Promise<ReversalLog | null> {
    try {
      // Get the event
      const { data: event, error: eventError } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('id', eventId)
        .eq('user_id', userId)
        .single();

      if (eventError || !event) {
        logger.error({ err: eventError, eventId, userId }, 'Event not found');
        return null;
      }

      if (!event.reversible) {
        logger.warn({ eventId, userId }, 'Event is not reversible');
        return null;
      }

      if (event.reversal_id) {
        logger.warn({ eventId, userId }, 'Event already reversed');
        return null;
      }

      // Create snapshot before reversal
      const snapshotBefore = await this.createSnapshot(event);

      // Perform reversal based on event type
      await this.performReversal(event);

      // Create snapshot after reversal
      const snapshotAfter = await this.createSnapshot(event);

      // Create reversal log
      const { data: reversalLog, error: reversalError } = await supabaseAdmin
        .from('reversal_logs')
        .insert({
          user_id: userId,
          event_id: eventId,
          reversed_by: 'USER',
          reason,
          snapshot_before: snapshotBefore,
          snapshot_after: snapshotAfter,
        })
        .select()
        .single();

      if (reversalError) {
        logger.error({ err: reversalError, eventId, userId }, 'Failed to create reversal log');
        throw reversalError;
      }

      // Mark event as reversed
      await supabaseAdmin
        .from('continuity_events')
        .update({ reversal_id: reversalLog.id })
        .eq('id', eventId);

      return reversalLog;
    } catch (error) {
      logger.error({ err: error, eventId, userId }, 'Failed to revert event');
      throw error;
    }
  }

  /**
   * Create snapshot of current state
   */
  private async createSnapshot(event: ContinuityEvent): Promise<Record<string, any>> {
    const snapshot: Record<string, any> = {};

    // Snapshot claims
    if (event.related_claim_ids && event.related_claim_ids.length > 0) {
      const { data: claims } = await supabaseAdmin
        .from('omega_claims')
        .select('*')
        .in('id', event.related_claim_ids);
      snapshot.claims = claims || [];
    }

    // Snapshot entities
    if (event.related_entity_ids && event.related_entity_ids.length > 0) {
      const { data: entities } = await supabaseAdmin
        .from('omega_entities')
        .select('*')
        .in('id', event.related_entity_ids);
      snapshot.entities = entities || [];
    }

    return snapshot;
  }

  /**
   * Perform the actual reversal based on event type
   */
  private async performReversal(event: ContinuityEvent): Promise<void> {
    switch (event.type) {
      case 'CLAIM_CREATED':
        // Delete the claim
        if (event.related_claim_ids && event.related_claim_ids.length > 0) {
          await supabaseAdmin
            .from('omega_claims')
            .update({ is_active: false })
            .in('id', event.related_claim_ids);
        }
        break;

      case 'CLAIM_UPDATED':
        // Restore previous state from context
        if (event.context.previous_state) {
          const previousState = event.context.previous_state;
          await supabaseAdmin
            .from('omega_claims')
            .update(previousState)
            .in('id', event.related_claim_ids);
        }
        break;

      case 'CLAIM_ENDED':
        // Reactivate the claim
        if (event.related_claim_ids && event.related_claim_ids.length > 0) {
          await supabaseAdmin
            .from('omega_claims')
            .update({ is_active: true, end_time: null })
            .in('id', event.related_claim_ids);
        }
        break;

      case 'ENTITY_MERGED':
        // TODO: Implement entity unmerge logic
        // This is complex - would need to restore source entity and reassign claims
        logger.warn({ eventId: event.id }, 'Entity merge reversal not fully implemented');
        break;

      case 'NARRATIVE_TRANSITION':
        // Revert narrative transition (would need to store previous state)
        logger.warn({ eventId: event.id }, 'Narrative transition reversal not fully implemented');
        break;

      default:
        logger.warn({ eventId: event.id, type: event.type }, 'Reversal not implemented for event type');
    }
  }

  /**
   * Get reversal log for an event
   */
  async getReversalLog(eventId: string, userId: string): Promise<ReversalLog | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('reversal_logs')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, eventId, userId }, 'Failed to get reversal log');
      return null;
    }
  }
}

export const continuityService = new ContinuityService();


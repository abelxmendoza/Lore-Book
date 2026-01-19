import { logger } from '../../logger';
import type { ContinuityEvent } from '../../types';
import { insightStorageService } from '../insightStorageService';
import { supabaseAdmin } from '../supabaseClient';

import { abandonedGoalDetectionService } from './abandonedGoalDetection';
import { arcShiftDetectionService } from './arcShiftDetection';
import { ContinuityAggregator } from './continuityAggregator';
import { ContinuityProfileStorage } from './continuityProfileStorage';
import type { ContinuityProfile } from './continuityTypes';
import { contradictionDetectionService } from './contradictionDetection';
import { emotionalArcDetectionService } from './emotionalArcDetection';
import { identityDriftDetectionService } from './identityDriftDetection';
import { thematicDriftDetectionService } from './thematicDriftDetection';

/**
 * Continuity Service - Main orchestrator
 * Runs all continuity detection algorithms and stores results
 */
class ContinuityService {
  /**
   * Run full continuity analysis for a user
   */
  async runContinuityAnalysis(userId: string): Promise<{
    events: ContinuityEvent[];
    summary: {
      contradictions: number;
      abandonedGoals: number;
      arcShifts: number;
      identityDrifts: number;
      emotionalTransitions: number;
      thematicDrifts: number;
    };
  }> {
    logger.info({ userId }, 'Starting continuity analysis');

    // 1. Fetch memory components from different time windows
    const components7Days = await this.getComponentsForWindow(userId, 7);
    const components30Days = await this.getComponentsForWindow(userId, 30);
    const components90Days = await this.getComponentsForWindow(userId, 90);

    logger.debug(
      {
        userId,
        components7Days: components7Days.length,
        components30Days: components30Days.length,
        components90Days: components90Days.length,
      },
      'Fetched components for analysis'
    );

    const allEvents: ContinuityEvent[] = [];

    // 2. Run contradiction detection
    try {
      const contradictions = await contradictionDetectionService.detectContradictions(
        components30Days,
        userId
      );
      const savedContradictions = await this.saveContinuityEvents(
        contradictions.map(c => ({
          ...c,
          user_id: userId,
        }))
      );
      allEvents.push(...savedContradictions);
      logger.info({ userId, count: savedContradictions.length }, 'Contradictions detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect contradictions');
    }

    // 3. Run abandoned goal detection
    try {
      const abandonedGoals = await abandonedGoalDetectionService.detectAbandonedGoals(
        components90Days,
        userId
      );
      const savedGoals = await this.saveContinuityEvents(
        abandonedGoals.map(g => ({
          ...g,
          user_id: userId,
        }))
      );
      allEvents.push(...savedGoals);
      logger.info({ userId, count: savedGoals.length }, 'Abandoned goals detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect abandoned goals');
    }

    // 4. Run arc shift detection
    try {
      const arcShifts = await arcShiftDetectionService.detectArcShifts(components7Days, userId);
      const savedShifts = await this.saveContinuityEvents(
        arcShifts.map(s => ({
          ...s,
          user_id: userId,
        }))
      );
      allEvents.push(...savedShifts);
      logger.info({ userId, count: savedShifts.length }, 'Arc shifts detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect arc shifts');
    }

    // 5. Run identity drift detection
    try {
      const identityDrifts = await identityDriftDetectionService.detectIdentityDrift(
        components7Days,
        userId
      );
      const savedDrifts = await this.saveContinuityEvents(
        identityDrifts.map(d => ({
          ...d,
          user_id: userId,
        }))
      );
      allEvents.push(...savedDrifts);
      logger.info({ userId, count: savedDrifts.length }, 'Identity drifts detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect identity drift');
    }

    // 6. Run emotional arc detection
    try {
      const emotionalArcs = await emotionalArcDetectionService.detectEmotionalArcs(
        components30Days
      );
      const savedArcs = await this.saveContinuityEvents(
        emotionalArcs.map(a => ({
          ...a,
          user_id: userId,
        }))
      );
      allEvents.push(...savedArcs);
      logger.info({ userId, count: savedArcs.length }, 'Emotional arcs detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect emotional arcs');
    }

    // 7. Run thematic drift detection
    try {
      const thematicDrifts = await thematicDriftDetectionService.detectThematicDrift(
        components7Days,
        components30Days
      );
      const savedThemes = await this.saveContinuityEvents(
        thematicDrifts.map(t => ({
          ...t,
          user_id: userId,
        }))
      );
      allEvents.push(...savedThemes);
      logger.info({ userId, count: savedThemes.length }, 'Thematic drifts detected');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect thematic drift');
    }

    // 8. Check for agency drift (NEW)
    try {
      const { WillStorage } = await import('../will');
      const willStorage = new WillStorage();
      const willEvents = await willStorage.getWillEvents(userId, { limit: 100 });
      const agencyFrequency = await willStorage.getAgencyFrequency(userId, 30);
      
      if (agencyFrequency < 0.1) {
        // Agency frequency below threshold
        const driftEvent = {
          event_type: 'agency_drift',
          description: `Agency frequency below threshold (${agencyFrequency.toFixed(3)} events per day in last 30 days)`,
          source_components: [],
          severity: agencyFrequency < 0.05 ? 0.8 : 0.6,
          metadata: { agency_frequency: agencyFrequency, threshold: 0.1 },
          user_id: userId,
        };
        const saved = await this.saveContinuityEvents([driftEvent]);
        allEvents.push(...saved);
        logger.info({ userId, agencyFrequency }, 'Agency drift detected');
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to check agency drift');
    }

    // 9. Generate insights from events
    await this.generateInsightsFromEvents(allEvents, userId);

    // 10. Summary
    const summary = {
      contradictions: allEvents.filter(e => e.event_type === 'contradiction').length,
      abandonedGoals: allEvents.filter(e => e.event_type === 'abandoned_goal').length,
      arcShifts: allEvents.filter(e => e.event_type === 'arc_shift').length,
      identityDrifts: allEvents.filter(e => e.event_type === 'identity_drift').length,
      emotionalTransitions: allEvents.filter(e => e.event_type === 'emotional_transition').length,
      thematicDrifts: allEvents.filter(e => e.event_type === 'thematic_drift').length,
      agencyDrifts: allEvents.filter(e => e.event_type === 'agency_drift').length,
    };

    logger.info({ userId, summary }, 'Continuity analysis completed');

    return {
      events: allEvents,
      summary,
    };
  }

  /**
   * Get components for a time window
   */
  private async getComponentsForWindow(
    userId: string,
    days: number
  ): Promise<Array<{
    id: string;
    journal_entry_id: string;
    component_type: string;
    text: string;
    characters_involved: string[];
    location: string | null;
    timestamp: string | null;
    tags: string[];
    importance_score: number;
    embedding: number[] | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get entries from window
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .gte('date', cutoffDate.toISOString())
      .limit(500);

    if (!entries || entries.length === 0) {
      return [];
    }

    const entryIds = entries.map(e => e.id);

    // Get components
    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in('journal_entry_id', entryIds)
      .limit(1000);

    return (components || []) as any[];
  }

  /**
   * Save continuity events to database
   */
  private async saveContinuityEvents(
    events: Array<{
      event_type: string;
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
      user_id: string;
    }>
  ): Promise<ContinuityEvent[]> {
    if (events.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('continuity_events')
      .insert(
        events.map(e => ({
          user_id: e.user_id,
          event_type: e.event_type,
          description: e.description,
          source_components: e.source_components,
          severity: e.severity,
          metadata: e.metadata,
        }))
      )
      .select();

    if (error) {
      logger.error({ error }, 'Failed to save continuity events');
      throw error;
    }

    return (data || []) as ContinuityEvent[];
  }

  /**
   * Generate insights from continuity events
   */
  private async generateInsightsFromEvents(
    events: ContinuityEvent[],
    userId: string
  ): Promise<void> {
    if (events.length === 0) return;

    // Group events by type
    const eventsByType = new Map<string, ContinuityEvent[]>();
    for (const event of events) {
      if (!eventsByType.has(event.event_type)) {
        eventsByType.set(event.event_type, []);
      }
      eventsByType.get(event.event_type)!.push(event);
    }

    // Generate insights for each type
    for (const [eventType, typeEvents] of eventsByType.entries()) {
      if (typeEvents.length === 0) continue;

      const insightText = this.generateInsightText(eventType, typeEvents);
      const sourceComponentIds = typeEvents.flatMap(e => e.source_components);

      try {
        await insightStorageService.storeInsight({
          user_id: userId,
          insight_type: this.mapEventTypeToInsightType(eventType),
          text: insightText,
          confidence: 0.7,
          source_component_ids: sourceComponentIds,
          source_entry_ids: [],
          tags: [eventType, 'continuity'],
          metadata: {
            event_count: typeEvents.length,
            event_type: eventType,
          },
        });
      } catch (error) {
        logger.error({ error, eventType }, 'Failed to store continuity insight');
      }
    }
  }

  /**
   * Generate insight text from events
   */
  private generateInsightText(eventType: string, events: ContinuityEvent[]): string {
    const count = events.length;
    const descriptions = events.map(e => e.description).slice(0, 3);

    switch (eventType) {
      case 'contradiction':
        return `Detected ${count} contradiction${count > 1 ? 's' : ''} in your memories. ${descriptions.join(' ')}`;
      case 'abandoned_goal':
        return `Found ${count} abandoned goal${count > 1 ? 's' : ''}. ${descriptions.join(' ')}`;
      case 'arc_shift':
        return `Detected ${count} life arc shift${count > 1 ? 's' : ''}. ${descriptions.join(' ')}`;
      case 'identity_drift':
        return `Noticed ${count} identity shift${count > 1 ? 's' : ''} in your self-perception. ${descriptions.join(' ')}`;
      case 'emotional_transition':
        return `Identified ${count} emotional transition${count > 1 ? 's' : ''}. ${descriptions.join(' ')}`;
      case 'thematic_drift':
        return `Observed ${count} thematic drift${count > 1 ? 's' : ''} in your life themes. ${descriptions.join(' ')}`;
      default:
        return `Detected ${count} continuity event${count > 1 ? 's' : ''} of type ${eventType}.`;
    }
  }

  /**
   * Map event type to insight type
   */
  private mapEventTypeToInsightType(eventType: string): string {
    const mapping: Record<string, string> = {
      contradiction: 'pattern',
      abandoned_goal: 'pattern',
      arc_shift: 'trend',
      identity_drift: 'identity_shift',
      emotional_transition: 'emotional',
      thematic_drift: 'trend',
    };

    return mapping[eventType] || 'pattern';
  }

  /**
   * Get continuity events for user
   */
  async getContinuityEvents(
    userId: string,
    eventType?: string,
    limit: number = 50
  ): Promise<ContinuityEvent[]> {
    let query = supabaseAdmin
      .from('continuity_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to get continuity events');
      throw error;
    }

    return (data || []) as ContinuityEvent[];
  }

  /**
   * Get goals (active and abandoned)
   */
  async getGoals(userId: string): Promise<{
    active: ContinuityEvent[];
    abandoned: ContinuityEvent[];
  }> {
    const allEvents = await this.getContinuityEvents(userId, undefined, 200);

    return {
      active: [], // TODO: Implement active goal detection
      abandoned: allEvents.filter(e => e.event_type === 'abandoned_goal'),
    };
  }

  /**
   * Get contradictions
   */
  async getContradictions(userId: string): Promise<ContinuityEvent[]> {
    return this.getContinuityEvents(userId, 'contradiction');
  }

  /**
   * Compute continuity profile (soul patterns)
   * This is expensive, so should be called periodically, not on every entry
   */
  async computeContinuityProfile(userId: string, timeWindowDays: number = 365): Promise<ContinuityProfile> {
    try {
      logger.info({ userId, timeWindowDays }, 'Computing continuity profile');
      
      const aggregator = new ContinuityAggregator();
      const profile = await aggregator.computeProfile(userId, timeWindowDays);
      
      // Save profile
      const storage = new ContinuityProfileStorage();
      await storage.saveProfile(userId, profile);
      
      logger.info({ userId, persistentValues: profile.persistent_values.length }, 'Continuity profile computed and saved');
      return profile;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to compute continuity profile');
      throw error;
    }
  }

  /**
   * Get latest continuity profile
   */
  async getContinuityProfile(userId: string): Promise<ContinuityProfile | null> {
    try {
      const storage = new ContinuityProfileStorage();
      return await storage.getProfile(userId);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get continuity profile');
      return null;
    }
  }

  /**
   * Get continuity profile history
   */
  async getContinuityProfileHistory(userId: string, limit: number = 10): Promise<ContinuityProfile[]> {
    try {
      const storage = new ContinuityProfileStorage();
      return await storage.getProfileHistory(userId, limit);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get continuity profile history');
      return [];
    }
  }
}

export const continuityService = new ContinuityService();


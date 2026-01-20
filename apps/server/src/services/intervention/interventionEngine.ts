import { logger } from '../../logger';
import { identityPulseModule, relationshipAnalyticsModule, insightEngineModule } from '../analytics';
import { continuityService } from '../continuity/continuityService';
import { RelationshipDynamicsEngine } from '../relationshipDynamics';
import { supabaseAdmin } from '../supabaseClient';

import { ContradictionDetector } from './detectors/contradictionDetector';
import { GoalAbandonmentDetector } from './detectors/goalAbandonmentDetector';
import { IdentityDriftDetector } from './detectors/identityDriftDetector';
import { MoodSpiralDetector } from './detectors/moodSpiralDetector';
import { NegativeLoopDetector } from './detectors/negativeLoopDetector';
import { RelationshipDriftDetector } from './detectors/relationshipDriftDetector';
import { InterventionStorage } from './interventionStorage';
import { InterventionPrioritizer } from './prioritizer';
import { PythonInterventionClient } from './pythonClient';
import { RecommenderBridge } from './recommenderBridge';
import type { Intervention, InterventionContext } from './types';

/**
 * Main Intervention Engine
 * Detects issues and generates interventions
 */
export class InterventionEngine {
  private detectors: Array<{
    detect: (ctx: InterventionContext) => Intervention[];
  }>;
  private prioritizer: InterventionPrioritizer;
  private python: PythonInterventionClient;
  private storage: InterventionStorage;
  private recommenderBridge: RecommenderBridge;

  constructor() {
    this.detectors = [
      new MoodSpiralDetector(),
      new GoalAbandonmentDetector(),
      new RelationshipDriftDetector(),
      new IdentityDriftDetector(),
      new ContradictionDetector(),
      new NegativeLoopDetector(),
    ];
    this.prioritizer = new InterventionPrioritizer();
    this.python = new PythonInterventionClient();
    this.storage = new InterventionStorage();
    this.recommenderBridge = new RecommenderBridge();
  }

  /**
   * Process interventions for a user
   */
  async process(userId: string, save: boolean = true): Promise<Intervention[]> {
    try {
      logger.debug({ userId }, 'Processing interventions');

      // Build intervention context from all engines
      const context = await this.buildContext(userId);

      // Run all detectors
      let interventions: Intervention[] = [];

      for (const detector of this.detectors) {
        try {
          const detected = detector.detect(context);
          interventions.push(...detected);
        } catch (error) {
          logger.error({ error, detector: detector.constructor.name }, 'Detector failed');
        }
      }

      // Run Python deep analysis
      try {
        const pythonInterventions = await this.python.runDeepAnalysis(context.events || []);
        interventions.push(...pythonInterventions);
      } catch (error) {
        logger.error({ error }, 'Python analysis failed');
      }

      // Add user_id to all interventions
      interventions = interventions.map(i => ({
        ...i,
        user_id: userId,
      }));

      // Prioritize interventions
      const prioritized = this.prioritizer.prioritize(interventions);

      // Save if requested
      if (save && prioritized.length > 0) {
        const saved = await this.storage.saveInterventions(prioritized);
        logger.info({ userId, count: saved.length }, 'Saved interventions');

        // Convert critical/high severity interventions to recommendations
        const criticalInterventions = prioritized.filter(
          i => i.severity === 'critical' || i.severity === 'high'
        );

        if (criticalInterventions.length > 0) {
          try {
            const recommendations = await this.recommenderBridge.toRecommendationsBatch(
              criticalInterventions,
              userId
            );
            // Note: Recommendations would be saved via Recommendation Engine
            logger.debug({ recommendations: recommendations.length }, 'Generated recommendations from interventions');
          } catch (error) {
            logger.error({ error }, 'Failed to convert interventions to recommendations');
          }
        }
      }

      logger.info({ userId, interventions: prioritized.length }, 'Processed interventions');

      return prioritized;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process interventions');
      return [];
    }
  }

  /**
   * Build intervention context from all engines
   */
  private async buildContext(userId: string): Promise<InterventionContext> {
    const context: InterventionContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      context.events = entries || [];

      // Fetch from analytics modules (they have their own caching)
      const [identityPulse, relationshipAnalytics, insights] = await Promise.all([
        identityPulseModule.run(userId).catch(() => null),
        relationshipAnalyticsModule.run(userId).catch(() => null),
        insightEngineModule.run(userId).catch(() => null),
      ]);

      context.identityPulse = identityPulse;
      context.relationshipAnalytics = relationshipAnalytics;
      context.insightEngine = insights;

      // Fetch continuity data
      try {
        const continuity = await continuityService.runContinuityAnalysis(userId);
        context.continuity = {
          contradictions: continuity.events.filter(e => e.event_type === 'contradiction'),
          abandonedGoals: continuity.events.filter(e => e.event_type === 'abandoned_goal'),
          identityDrift: continuity.events.find(e => e.event_type === 'identity_drift'),
          arcShifts: continuity.events.filter(e => e.event_type === 'arc_shift'),
        };
      } catch (error) {
        logger.error({ error }, 'Failed to fetch continuity data');
      }

      // Fetch relationship dynamics
      try {
        const relationshipEngine = new RelationshipDynamicsEngine();
        const relationships = await relationshipEngine.getAllRelationships(userId);
        context.relationshipDynamics = relationships;
      } catch (error) {
        logger.error({ error }, 'Failed to fetch relationship dynamics');
      }

      // Fetch goals (from continuity or other sources)
      context.goals = context.continuity?.abandonedGoals || [];

    } catch (error) {
      logger.error({ error }, 'Failed to build intervention context');
    }

    return context;
  }

  /**
   * Get active interventions
   */
  async getActiveInterventions(
    userId: string,
    limit?: number,
    minSeverity?: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<Intervention[]> {
    return this.storage.getActiveInterventions(userId, limit, minSeverity);
  }

  /**
   * Update intervention status
   */
  async updateStatus(
    interventionId: string,
    status: 'acknowledged' | 'resolved' | 'dismissed'
  ): Promise<boolean> {
    return this.storage.updateStatus(interventionId, status);
  }

  /**
   * Get intervention statistics
   */
  async getStats(userId: string) {
    return this.storage.getStats(userId);
  }
}


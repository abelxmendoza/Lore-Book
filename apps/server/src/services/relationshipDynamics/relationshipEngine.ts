import { logger } from '../../logger';

import { RelationshipAnalyzer } from './relationshipAnalyzer';
import { RelationshipHealthTracker } from './relationshipHealth';
import { RelationshipLifecycleDetector } from './relationshipLifecycle';
import { RelationshipStorage } from './relationshipStorage';
import type {
  RelationshipDynamics,
  RelationshipInsight,
  RelationshipHealth,
  RelationshipStage,
} from './types';

/**
 * Main Relationship Dynamics Engine
 * Tracks relationship evolution, health, and patterns
 */
export class RelationshipDynamicsEngine {
  private analyzer: RelationshipAnalyzer;
  private healthTracker: RelationshipHealthTracker;
  private lifecycleDetector: RelationshipLifecycleDetector;
  private storage: RelationshipStorage;

  constructor() {
    this.analyzer = new RelationshipAnalyzer();
    this.healthTracker = new RelationshipHealthTracker();
    this.lifecycleDetector = new RelationshipLifecycleDetector();
    this.storage = new RelationshipStorage();
  }

  /**
   * Analyze and update relationship dynamics
   */
  async analyzeRelationship(
    userId: string,
    personName: string,
    lookbackMonths: number = 12,
    save: boolean = true
  ): Promise<RelationshipDynamics | null> {
    try {
      logger.debug({ userId, personName, lookbackMonths }, 'Analyzing relationship');

      // Analyze interactions and metrics
      const analysis = await this.analyzer.analyzeRelationship(
        userId,
        personName,
        lookbackMonths
      );

      if (!analysis) {
        return null;
      }

      const { interactions, metrics } = analysis;

      // Calculate health
      const health = this.healthTracker.calculateHealth(metrics);

      // Detect lifecycle
      const lifecycle = this.lifecycleDetector.detectLifecycle(interactions, metrics);

      // Extract common topics
      const topicCounts = new Map<string, number>();
      interactions.forEach(i => {
        (i.topics || []).forEach(topic => {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        });
      });
      const commonTopics = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);

      // Get first and last mentions
      const firstMentioned = interactions[0]?.date || new Date().toISOString();
      const lastMentioned = interactions[interactions.length - 1]?.date || new Date().toISOString();

      const dynamics: RelationshipDynamics = {
        user_id: userId,
        person_name: personName,
        metrics,
        health,
        lifecycle,
        interactions,
        first_mentioned: firstMentioned,
        last_mentioned: lastMentioned,
        total_interactions: interactions.length,
        common_topics: commonTopics,
        metadata: {
          analyzed_at: new Date().toISOString(),
          lookback_months: lookbackMonths,
        },
      };

      // Save if requested
      if (save) {
        const saved = await this.storage.saveRelationshipDynamics(dynamics);
        if (saved) {
          return saved;
        }
      }

      logger.info({ userId, personName }, 'Analyzed relationship dynamics');

      return dynamics;
    } catch (error) {
      logger.error({ error, userId, personName }, 'Failed to analyze relationship');
      return null;
    }
  }

  /**
   * Get relationship dynamics
   */
  async getRelationshipDynamics(
    userId: string,
    personName: string
  ): Promise<RelationshipDynamics | null> {
    return this.storage.getRelationshipDynamics(userId, personName);
  }

  /**
   * Get all relationships
   */
  async getAllRelationships(userId: string): Promise<RelationshipDynamics[]> {
    return this.storage.getAllRelationships(userId);
  }

  /**
   * Get relationships by health
   */
  async getRelationshipsByHealth(
    userId: string,
    health: RelationshipHealth
  ): Promise<RelationshipDynamics[]> {
    return this.storage.getRelationshipsByHealth(userId, health);
  }

  /**
   * Get relationships by stage
   */
  async getRelationshipsByStage(
    userId: string,
    stage: RelationshipStage
  ): Promise<RelationshipDynamics[]> {
    return this.storage.getRelationshipsByStage(userId, stage);
  }

  /**
   * Generate insights
   */
  async generateInsights(userId: string): Promise<RelationshipInsight[]> {
    const insights: RelationshipInsight[] = [];
    const relationships = await this.getAllRelationships(userId);

    for (const rel of relationships) {
      // Health change insights
      if (rel.health.trends.health_trend === 'declining') {
        insights.push({
          type: 'health_change',
          title: `Relationship with ${rel.person_name} is declining`,
          description: `Health score: ${rel.health.health_score}/100. ${rel.health.concerns?.join(', ') || 'Consider reaching out.'}`,
          person_name: rel.person_name,
          severity: rel.health.overall_health === 'critical' ? 'critical' : 'warning',
          actionable: true,
          recommendation: `Consider checking in with ${rel.person_name}. Last interaction was ${rel.metrics.last_interaction_days_ago} days ago.`,
          metadata: {
            health_score: rel.health.health_score,
            concerns: rel.health.concerns,
          },
        });
      }

      // Stage transition insights
      if (rel.lifecycle.transitions.length > 0) {
        const lastTransition = rel.lifecycle.transitions[rel.lifecycle.transitions.length - 1];
        if (lastTransition.to_stage === 'declining' || lastTransition.to_stage === 'distant') {
          insights.push({
            type: 'stage_transition',
            title: `Relationship with ${rel.person_name} has transitioned to ${lastTransition.to_stage}`,
            description: `The relationship moved from ${lastTransition.from_stage} to ${lastTransition.to_stage}.`,
            person_name: rel.person_name,
            severity: lastTransition.to_stage === 'declining' ? 'warning' : 'info',
            actionable: true,
            recommendation: lastTransition.trigger || 'Consider reconnecting.',
            metadata: {
              transition: lastTransition,
            },
          });
        }
      }

      // Pattern insights
      if (rel.metrics.conflict_frequency > 1) {
        insights.push({
          type: 'pattern_detected',
          title: `High conflict frequency with ${rel.person_name}`,
          description: `Conflict frequency: ${rel.metrics.conflict_frequency.toFixed(1)} per month.`,
          person_name: rel.person_name,
          severity: 'warning',
          actionable: true,
          recommendation: 'Consider addressing underlying issues or seeking mediation.',
          metadata: {
            conflict_frequency: rel.metrics.conflict_frequency,
          },
        });
      }
    }

    return insights;
  }

  /**
   * Get relationship statistics
   */
  async getStats(userId: string) {
    return this.storage.getStats(userId);
  }
}


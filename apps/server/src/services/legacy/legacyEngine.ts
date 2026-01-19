import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { LegacyClusterer } from './legacyCluster';
import { LegacyExtractor } from './legacyExtractor';
import { LegacyNarrative } from './legacyNarrative';
import { LegacyScorer } from './legacyScorer';
import { LegacySignalService } from './legacySignal';
import { LegacyTrajectory } from './legacyTrajectory';
import type {
  LegacySignal,
  LegacyInsight,
  LegacyDomainResult,
  LegacyCluster,
  LegacyContext,
  LegacyDomain,
} from './types';

/**
 * Main Legacy Engine
 * Tracks long-term purpose, meaning, and impact mapping
 */
export class LegacyEngine {
  private extractor: LegacyExtractor;
  private signalService: LegacySignalService;
  private trajectory: LegacyTrajectory;
  private clusterer: LegacyClusterer;
  private scorer: LegacyScorer;
  private narrative: LegacyNarrative;

  constructor() {
    this.extractor = new LegacyExtractor();
    this.signalService = new LegacySignalService();
    this.trajectory = new LegacyTrajectory();
    this.clusterer = new LegacyClusterer();
    this.scorer = new LegacyScorer();
    this.narrative = new LegacyNarrative();
  }

  /**
   * Process legacy for a user
   */
  async process(userId: string): Promise<{
    results: LegacyDomainResult[];
    insights: LegacyInsight[];
    clusters: LegacyCluster[];
    narrative: string;
    signals: LegacySignal[];
  }> {
    try {
      logger.debug({ userId }, 'Processing legacy');

      // Build legacy context
      const context = await this.buildContext(userId);

      // Extract legacy signals
      const rawSignals = this.extractor.extract(context);
      const signals = this.signalService.normalize(rawSignals);
      
      // Add user_id to all signals
      signals.forEach(s => { s.user_id = userId; });

      // Group by domain
      const byDomain = this.signalService.byDomain(signals);

      const results: LegacyDomainResult[] = [];
      const insights: LegacyInsight[] = [];

      // Process each domain
      for (const [domain, domainSignals] of Object.entries(byDomain)) {
        const score = this.scorer.score(domainSignals);
        const traj = this.trajectory.build(domainSignals);
        const positiveSignals = domainSignals.filter(s => s.direction === 1).length;
        const negativeSignals = domainSignals.filter(s => s.direction === -1).length;

        // Generate insights
        if (score > 0.6) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_strengthening',
            domain: domain as LegacyDomain,
            message: `Your legacy in ${domain} is growing and strengthening.`,
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            metadata: {
              score,
              signal_count: domainSignals.length,
            },
          });
        } else if (score < -0.3) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_fragility',
            domain: domain as LegacyDomain,
            message: `Your legacy in ${domain} is at risk. Consider what might be causing this.`,
            timestamp: new Date().toISOString(),
            confidence: 0.85,
            metadata: {
              score,
              signal_count: domainSignals.length,
            },
          });
        }

        // Check for legacy shift
        const trend = this.trajectory.getTrend(traj);
        if (trend === 'strengthening' && domainSignals.length >= 5) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_shift',
            domain: domain as LegacyDomain,
            message: `Your legacy in ${domain} is shifting toward strengthening.`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
          });
        } else if (trend === 'weakening' && domainSignals.length >= 5) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_fragility',
            domain: domain as LegacyDomain,
            message: `Your legacy in ${domain} is showing signs of weakening.`,
            timestamp: new Date().toISOString(),
            confidence: 0.75,
          });
        }

        // Check for legacy foundation (early strong signals)
        if (domainSignals.length >= 3 && score > 0.4 && domainSignals.every(s => s.direction === 1)) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_foundation',
            domain: domain as LegacyDomain,
            message: `You're building a strong foundation for your legacy in ${domain}.`,
            timestamp: new Date().toISOString(),
            confidence: 0.85,
          });
        }

        // Build result
        results.push({
          domain: domain as LegacyDomain,
          score,
          trajectory: traj,
          signal_count: domainSignals.length,
          positive_signals: positiveSignals,
          negative_signals: negativeSignals,
          metadata: {
            cumulative_trajectory: this.trajectory.buildCumulative(domainSignals),
            trajectory_summary: this.trajectory.getSummary(traj),
            trend,
            consistency: this.scorer.calculateConsistency(domainSignals),
            strength_category: this.scorer.getStrengthCategory(score),
          },
        });
      }

      // Cluster signals into themes
      const clusters = await this.clusterer.cluster(signals);
      clusters.forEach(c => { c.user_id = userId; });

      // Generate insights from clusters
      for (const cluster of clusters) {
        if (cluster.significance >= 0.7) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'legacy_breakthrough',
            domain: cluster.domain,
            message: `Strong legacy theme detected: "${cluster.theme}". This is becoming a significant part of your legacy.`,
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            metadata: {
              theme: cluster.theme,
              significance: cluster.significance,
            },
          });
        }
      }

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Generate narrative
      const narrative = this.narrative.buildFromResults(results);

      // Sort results by score (highest first)
      results.sort((a, b) => b.score - a.score);

      logger.info(
        { userId, domains: results.length, insights: insights.length, clusters: clusters.length, signals: signals.length },
        'Processed legacy'
      );

      return { results, insights, clusters, narrative, signals };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process legacy');
      return { results: [], insights: [], clusters: [], narrative: '', signals: [] };
    }
  }

  /**
   * Build legacy context from entries
   */
  private async buildContext(userId: string): Promise<LegacyContext> {
    const context: LegacyContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get continuity data if available
      // TODO: Fetch from continuity engine if needed

      // Get arcs data if available
      // TODO: Fetch from arcs/narrative engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build legacy context');
    }

    return context;
  }
}


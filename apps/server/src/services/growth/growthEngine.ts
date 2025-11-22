import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  GrowthSignal,
  GrowthInsight,
  GrowthDomainResult,
  GrowthContext,
  GrowthDomain,
} from './types';
import { GrowthExtractor } from './growthExtractor';
import { GrowthSignals } from './growthSignals';
import { GrowthVelocity } from './growthVelocity';
import { PlateauDetector } from './plateauDetector';
import { BreakthroughDetector } from './breakthroughDetector';
import { GrowthScorer } from './growthScorer';
import { GrowthTimeline } from './growthTimeline';

/**
 * Main Growth Trajectory Engine
 * Tracks growth signals, detects plateaus, breakthroughs, and calculates growth velocity
 */
export class GrowthEngine {
  private extractor: GrowthExtractor;
  private group: GrowthSignals;
  private velocity: GrowthVelocity;
  private plateau: PlateauDetector;
  private breakthrough: BreakthroughDetector;
  private scorer: GrowthScorer;
  private timeline: GrowthTimeline;

  constructor() {
    this.extractor = new GrowthExtractor();
    this.group = new GrowthSignals();
    this.velocity = new GrowthVelocity();
    this.plateau = new PlateauDetector();
    this.breakthrough = new BreakthroughDetector();
    this.scorer = new GrowthScorer();
    this.timeline = new GrowthTimeline();
  }

  /**
   * Process growth for a user
   */
  async process(userId: string): Promise<{
    results: GrowthDomainResult[];
    insights: GrowthInsight[];
    signals: GrowthSignal[];
  }> {
    try {
      logger.debug({ userId }, 'Processing growth');

      // Build growth context
      const context = await this.buildContext(userId);

      // Extract growth signals
      const signals = this.extractor.extract(context);
      
      // Add user_id to all signals
      signals.forEach(s => { s.user_id = userId; });

      // Group signals by domain
      const domains = this.group.group(signals);

      const insights: GrowthInsight[] = [];
      const results: GrowthDomainResult[] = [];

      // Process each domain
      for (const [domain, domainSignals] of Object.entries(domains)) {
        const values = this.group.getValues(domainSignals);
        const velocity = this.velocity.compute(domainSignals);
        const isPlateau = this.plateau.detect(values);
        const isStagnation = this.plateau.detectStagnation(values);
        const isBreakthrough = this.breakthrough.detect(values);
        const isMajorBreakthrough = this.breakthrough.detectMajor(values);
        const hasRegression = domainSignals.some(s => s.direction === -1);

        // Generate insights
        if (isPlateau) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'plateau',
            domain: domain as GrowthDomain,
            message: `You're plateauing in ${domain}. Time to switch stimulus or increase intensity.`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            metadata: {
              plateau_duration: this.plateau.calculateDuration(values),
            },
          });
        }

        if (isStagnation) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'stagnation_zone',
            domain: domain as GrowthDomain,
            message: `Stagnation detected in ${domain}. Consider new strategies or goals.`,
            timestamp: new Date().toISOString(),
            confidence: 0.85,
          });
        }

        if (isBreakthrough) {
          const magnitude = this.breakthrough.calculateMagnitude(values);
          insights.push({
            id: crypto.randomUUID(),
            type: 'breakthrough',
            domain: domain as GrowthDomain,
            message: isMajorBreakthrough
              ? `Major breakthrough detected in ${domain}!`
              : `Breakthrough detected in ${domain}!`,
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            metadata: {
              magnitude,
              is_major: isMajorBreakthrough,
            },
          });
        }

        if (this.velocity.detectSpike(domainSignals)) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'growth_velocity_spike',
            domain: domain as GrowthDomain,
            message: `Growth velocity spike in ${domain}! You're accelerating.`,
            timestamp: new Date().toISOString(),
            confidence: 0.85,
          });
        }

        if (hasRegression) {
          const regressionCount = domainSignals.filter(s => s.direction === -1).length;
          if (regressionCount >= 2) {
            insights.push({
              id: crypto.randomUUID(),
              type: 'regression',
              domain: domain as GrowthDomain,
              message: `Regression detected in ${domain}. Consider what changed.`,
              timestamp: new Date().toISOString(),
              confidence: 0.75,
              metadata: {
                regression_count: regressionCount,
              },
            });
          }
        }

        // Calculate score
        const score = this.scorer.score({
          velocity,
          breakthroughs: isBreakthrough ? 1 : 0,
          plateaus: isPlateau ? 1 : 0,
          regressions: hasRegression ? 1 : 0,
          signalCount: domainSignals.length,
        });

        // Build result
        results.push({
          domain: domain as GrowthDomain,
          velocity,
          score,
          signal_count: domainSignals.length,
          timeline: this.timeline.build(domainSignals),
          metadata: {
            trajectory: this.timeline.buildTrajectory(domainSignals),
            summary: this.timeline.getSummary(domainSignals),
            category: this.scorer.getCategory(score),
            has_plateau: isPlateau,
            has_breakthrough: isBreakthrough,
            has_regression: hasRegression,
          },
        });
      }

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Sort results by score (highest first)
      results.sort((a, b) => b.score - a.score);

      logger.info(
        { userId, domains: results.length, insights: insights.length, signals: signals.length },
        'Processed growth'
      );

      return { results, insights, signals };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process growth');
      return { results: [], insights: [], signals: [] };
    }
  }

  /**
   * Build growth context from entries
   */
  private async buildContext(userId: string): Promise<GrowthContext> {
    const context: GrowthContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);

      context.entries = entries || [];

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get relationships data if available
      // TODO: Fetch from relationship analytics if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build growth context');
    }

    return context;
  }
}


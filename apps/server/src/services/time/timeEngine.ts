import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { ActivityClassifier } from './activityClassifier';
import { TimeCycleDetector } from './cycleDetector';
import { EnergyCurveEstimator } from './energyCurveEstimator';
import { ProcrastinationDetector } from './procrastinationDetector';
import { TimeBlockParser } from './timeBlocks';
import { TimeExtractor } from './timeExtractor';
import { TimeScoreService } from './timeScore';
import type {
  TimeOutput,
  TimeContext,
  TimeInsight,
  TimeCategory,
} from './types';

/**
 * Main Time Management Engine
 * Tracks time usage, productivity patterns, focus windows, and procrastination
 */
export class TimeEngine {
  private extractor: TimeExtractor;
  private classifier: ActivityClassifier;
  private blockParser: TimeBlockParser;
  private procrastinationDetector: ProcrastinationDetector;
  private energyEstimator: EnergyCurveEstimator;
  private cycleDetector: TimeCycleDetector;
  private scoreService: TimeScoreService;

  constructor() {
    this.extractor = new TimeExtractor();
    this.classifier = new ActivityClassifier();
    this.blockParser = new TimeBlockParser();
    this.procrastinationDetector = new ProcrastinationDetector();
    this.energyEstimator = new EnergyCurveEstimator();
    this.cycleDetector = new TimeCycleDetector();
    this.scoreService = new TimeScoreService();
  }

  /**
   * Process time management for a user
   */
  async process(userId: string): Promise<TimeOutput> {
    try {
      logger.debug({ userId }, 'Processing time management');

      // Build context
      const context = await this.buildContext(userId);

      // Extract time events
      const events = this.extractor.extract(context.entries || []);
      events.forEach(e => { e.user_id = userId; });

      // Classify activities
      const activity = this.classifier.classify(events);

      // Parse time blocks
      const blocks = this.blockParser.parse(events);
      blocks.forEach(b => { b.user_id = userId; });

      // Detect procrastination
      const procrastination = this.procrastinationDetector.detect(context.entries || []);
      procrastination.forEach(p => { p.user_id = userId; });

      // Estimate energy curve
      const energy = this.energyEstimator.estimate(events);

      // Detect cycles
      const cycles = this.cycleDetector.detect(events);

      // Compute time score
      const score = this.scoreService.compute(blocks, procrastination, energy);

      // Generate insights
      const insights: TimeInsight[] = [];

      // Time event insights
      if (events.length > 0) {
        const topActivities = this.classifier.getTopActivities(events, 3);
        insights.push({
          id: crypto.randomUUID(),
          type: 'time_event_detected',
          message: `${events.length} time events detected. Top activities: ${topActivities.map(a => a.category).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            event_count: events.length,
            top_activities: topActivities,
          },
        });
      }

      // Procrastination insights
      if (procrastination.length > 0) {
        const procrastinationDist = this.procrastinationDetector.getProcrastinationDistribution(procrastination);
        const topTypes = Object.entries(procrastinationDist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([type]) => type);

        insights.push({
          id: crypto.randomUUID(),
          type: 'procrastination_detected',
          message: `${procrastination.length} procrastination signals detected. Top types: ${topTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            procrastination_count: procrastination.length,
            top_types: topTypes,
          },
        });
      }

      // Energy peak insights
      const peakHours = this.energyEstimator.getPeakHours(energy);
      if (peakHours.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'energy_peak',
          message: `Peak energy hours detected: ${peakHours.slice(0, 3).map(h => `${h}:00`).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            peak_hours: peakHours,
          },
        });
      }

      // Energy low insights
      const lowHours = this.energyEstimator.getLowEnergyHours(energy);
      if (lowHours.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'energy_low',
          message: `Low energy hours detected: ${lowHours.slice(0, 3).map(h => `${h}:00`).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            low_hours: lowHours,
          },
        });
      }

      // Time block insights
      if (blocks.length > 0) {
        const totalTime = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
        const avgBlockDuration = totalTime / blocks.length;

        insights.push({
          id: crypto.randomUUID(),
          type: 'time_block_detected',
          message: `${blocks.length} time blocks detected. Average duration: ${Math.round(avgBlockDuration)} minutes`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            block_count: blocks.length,
            total_time_minutes: totalTime,
            average_duration: avgBlockDuration,
          },
        });
      }

      // Cycle insights
      cycles.forEach(cycle => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'cycle_detected',
          message: `${cycle.cycleType} cycle detected.`,
          timestamp: new Date().toISOString(),
          confidence: cycle.confidence || 0.6,
          user_id: userId,
          metadata: {
            cycle_type: cycle.cycleType,
            phases: cycle.phases,
          },
        });
      });

      // Efficiency insights
      if (score.efficiency < 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'efficiency_decline',
          message: `Low efficiency detected (${(score.efficiency * 100).toFixed(0)}%). Consider addressing procrastination patterns.`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            efficiency_score: score.efficiency,
            procrastination_count: procrastination.length,
          },
        });
      } else if (score.efficiency > 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'efficiency_improvement',
          message: `High efficiency detected (${(score.efficiency * 100).toFixed(0)}%).`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            efficiency_score: score.efficiency,
          },
        });
      }

      // Focus window insights
      if (score.focus > 0.6) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'focus_window',
          message: `Strong focus detected (${(score.focus * 100).toFixed(0)}% focus activities).`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            focus_score: score.focus,
          },
        });
      }

      // Distraction pattern insights
      const distractionSignals = procrastination.filter(p => p.type === 'distraction');
      if (distractionSignals.length > procrastination.length * 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'distraction_pattern',
          message: `High distraction pattern detected (${distractionSignals.length} distraction signals).`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            distraction_count: distractionSignals.length,
            total_procrastination: procrastination.length,
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          events: events.length,
          blocks: blocks.length,
          procrastination: procrastination.length,
          cycles: cycles.length,
          timeScore: score.overall,
          insights: insights.length,
        },
        'Processed time management'
      );

      return {
        events,
        activity,
        blocks,
        procrastination,
        energy,
        cycles,
        score,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process time management');
      return {
        events: [],
        activity: {
          work: 0,
          coding: 0,
          gym: 0,
          bjj: 0,
          muay_thai: 0,
          robotics: 0,
          learning: 0,
          family: 0,
          social: 0,
          travel: 0,
          sleep: 0,
          eating: 0,
          rest: 0,
          errands: 0,
          entertainment: 0,
          unknown: 0,
        },
        blocks: [],
        procrastination: [],
        energy: Array.from({ length: 24 }, (_, hour) => ({ hour, level: 0.5, count: 0 })),
        cycles: [],
        score: {
          consistency: 0.5,
          efficiency: 0.5,
          distribution: 0.5,
          focus: 0.5,
          overall: 0.5,
        },
        insights: [],
      };
    }
  }

  /**
   * Build time context from entries
   */
  private async buildContext(userId: string): Promise<TimeContext> {
    const context: TimeContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for time analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get creative data if available
      // TODO: Fetch from creative engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build time context');
    }

    return context;
  }
}


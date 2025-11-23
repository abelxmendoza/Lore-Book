import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  DreamsOutput,
  DreamsContext,
  DreamInsight,
  DreamCategory,
} from './types';
import { DreamExtractor } from './dreamExtractor';
import { AspirationExtractor } from './aspirationExtractor';
import { DreamClassifier } from './dreamClassifier';
import { DreamClarityScorer } from './dreamClarityScorer';
import { DreamConflictDetector } from './dreamConflictDetector';
import { DreamTrajectory } from './dreamTrajectory';
import { DreamEvolution } from './dreamEvolution';

/**
 * Main Dreams & Aspirations Engine
 * Tracks long-term desires, life direction, and ambition arcs
 */
export class DreamsEngine {
  private dreamExtractor: DreamExtractor;
  private aspirationExtractor: AspirationExtractor;
  private classifier: DreamClassifier;
  private clarityScorer: DreamClarityScorer;
  private conflictDetector: DreamConflictDetector;
  private trajectory: DreamTrajectory;
  private evolution: DreamEvolution;

  constructor() {
    this.dreamExtractor = new DreamExtractor();
    this.aspirationExtractor = new AspirationExtractor();
    this.classifier = new DreamClassifier();
    this.clarityScorer = new DreamClarityScorer();
    this.conflictDetector = new DreamConflictDetector();
    this.trajectory = new DreamTrajectory();
    this.evolution = new DreamEvolution();
  }

  /**
   * Process dreams and aspirations for a user
   */
  async process(userId: string): Promise<DreamsOutput> {
    try {
      logger.debug({ userId }, 'Processing dreams and aspirations');

      // Build context
      const context = await this.buildContext(userId);

      // Extract dream signals
      const dreamSignals = this.dreamExtractor.extract(context.entries || []);
      dreamSignals.forEach(d => { d.user_id = userId; });

      // Extract aspiration signals
      const aspirationSignals = this.aspirationExtractor.extract(context.entries || []);
      aspirationSignals.forEach(a => { a.user_id = userId; });

      // Classify dreams
      const groups = this.classifier.groupByCategory(dreamSignals);
      const coreDreams = this.classifier.detectCoreDreams(groups);

      // Calculate clarity
      const overallClarity = this.clarityScorer.score(dreamSignals);
      const clarityByCategory = this.clarityScorer.scoreByCategory(dreamSignals);

      // Detect conflicts
      const conflicts = this.conflictDetector.detect(groups);

      // Build trajectory
      const dreamTrajectory = this.trajectory.buildTimeline(dreamSignals);
      const trajectorySummary = this.trajectory.getSummary(dreamTrajectory);
      const trajectoryTrends = this.trajectory.detectTrends(dreamTrajectory);

      // Compute evolution
      const evolution = this.evolution.computeEvolution(dreamSignals);
      const evolutionShifts = this.evolution.detectShifts(evolution);
      const evolutionSummary = this.evolution.getSummary(evolution);

      // Generate insights
      const insights: DreamInsight[] = [];

      // Core dream insights
      coreDreams.forEach((d) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'core_dream_detected',
          category: d as DreamCategory,
          message: `Core dream identified: ${d}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            dream_category: d,
            signal_count: groups[d]?.length || 0,
            clarity: clarityByCategory[d] || 0,
          },
        });
      });

      // Conflict insights
      conflicts.forEach((c) => {
        const severity = this.conflictDetector.getConflictSeverity(groups, c);
        insights.push({
          id: crypto.randomUUID(),
          type: 'dream_conflict',
          message: `Dream conflict detected: ${c.replace(/_/g, ' ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            conflict_name: c,
            severity,
          },
        });
      });

      // Dream shift insights
      evolutionShifts.forEach((shift) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'dream_shift',
          category: shift.category as DreamCategory,
          message: `Dream shift detected: ${shift.category} is ${shift.shift}`,
          timestamp: new Date().toISOString(),
          confidence: 0.75,
          user_id: userId,
          metadata: {
            shift_type: shift.shift,
            first_year: shift.first_year,
            last_year: shift.last_year,
          },
        });
      });

      // Dream strengthening insights (increasing clarity/desire)
      if (trajectoryTrends.clarity_trend === 'improving' || trajectoryTrends.desire_trend === 'increasing') {
        insights.push({
          id: crypto.randomUUID(),
          type: 'dream_strengthening',
          message: `Your dreams are ${trajectoryTrends.clarity_trend === 'improving' ? 'becoming clearer' : 'growing stronger'}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            clarity_trend: trajectoryTrends.clarity_trend,
            desire_trend: trajectoryTrends.desire_trend,
          },
        });
      }

      // Dream decay insights (declining clarity/desire)
      if (trajectoryTrends.clarity_trend === 'declining' || trajectoryTrends.desire_trend === 'decreasing') {
        insights.push({
          id: crypto.randomUUID(),
          type: 'dream_decay',
          message: `Your dreams are ${trajectoryTrends.clarity_trend === 'declining' ? 'becoming less clear' : 'losing intensity'}`,
          timestamp: new Date().toISOString(),
          confidence: 0.75,
          user_id: userId,
          metadata: {
            clarity_trend: trajectoryTrends.clarity_trend,
            desire_trend: trajectoryTrends.desire_trend,
          },
        });
      }

      // Aspiration reinforced insights (aspirations that appear frequently)
      const aspirationCounts: Record<string, number> = {};
      aspirationSignals.forEach(a => {
        const key = a.statement.substring(0, 50);
        aspirationCounts[key] = (aspirationCounts[key] || 0) + 1;
      });

      Object.entries(aspirationCounts)
        .filter(([_, count]) => count >= 3)
        .forEach(([statement, count]) => {
          insights.push({
            id: crypto.randomUUID(),
            type: 'aspiration_reinforced',
            message: `Reinforced aspiration: "${statement}..." (appears ${count} times)`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            user_id: userId,
            metadata: {
              statement,
              count,
            },
          });
        });

      logger.info(
        {
          userId,
          coreDreams: coreDreams.length,
          conflicts: conflicts.length,
          insights: insights.length,
          dreamSignals: dreamSignals.length,
          aspirationSignals: aspirationSignals.length,
          overallClarity,
        },
        'Processed dreams and aspirations'
      );

      return {
        coreDreams,
        clusters: groups,
        aspirations: aspirationSignals,
        conflicts,
        evolution,
        futureProjection: null, // Placeholder for Python projection module
        insights,
        dreamSignals,
        aspirationSignals,
        trajectory: dreamTrajectory,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process dreams and aspirations');
      return {
        coreDreams: [],
        clusters: {},
        aspirations: [],
        conflicts: [],
        evolution: {},
        insights: [],
      };
    }
  }

  /**
   * Build dreams context from entries
   */
  private async buildContext(userId: string): Promise<DreamsContext> {
    const context: DreamsContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for dreams/aspirations analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get continuity data if available
      // TODO: Fetch from continuity engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get values data if available
      // TODO: Fetch from values engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build dreams context');
    }

    return context;
  }
}


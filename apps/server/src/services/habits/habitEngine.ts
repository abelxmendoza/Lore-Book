import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Habit, HabitInsight, HabitContext } from './types';
import { HabitExtractor } from './habitExtractor';
import { HabitLoopDetector } from './habitLoopDetector';
import { StreakCalculator } from './streakCalculator';
import { HabitDecayDetector } from './decayDetector';
import { HabitClusterer } from './habitClusterer';
import { ReinforcementGenerator } from './reinforcementGenerator';

/**
 * Main Habit Formation Engine
 * Extracts, tracks, and analyzes habits
 */
export class HabitEngine {
  private extractor: HabitExtractor;
  private loops: HabitLoopDetector;
  private streaks: StreakCalculator;
  private decay: HabitDecayDetector;
  private clusterer: HabitClusterer;
  private reinforcer: ReinforcementGenerator;

  constructor() {
    this.extractor = new HabitExtractor();
    this.loops = new HabitLoopDetector();
    this.streaks = new StreakCalculator();
    this.decay = new HabitDecayDetector();
    this.clusterer = new HabitClusterer();
    this.reinforcer = new ReinforcementGenerator();
  }

  /**
   * Process habits for a user
   */
  async process(userId: string): Promise<{
    habits: Habit[];
    insights: HabitInsight[];
    reinforcement: any[];
  }> {
    try {
      logger.debug({ userId }, 'Processing habits');

      // Build habit context
      const context = await this.buildContext(userId);

      // Extract habits
      const habits = this.extractor.extract(context);
      
      // Add user_id to all habits
      habits.forEach(h => { h.user_id = userId; });

      // Detect habit loops
      const loopInsights = this.loops.detect(habits, context);

      // Calculate streaks
      const streakInsights = this.streaks.calculate(habits);

      // Detect decay
      const decayInsights = this.decay.detect(habits);

      // Cluster habits
      const clusterInsights = await this.clusterer.cluster(habits);

      // Combine all insights
      const insights: HabitInsight[] = [
        ...loopInsights,
        ...streakInsights,
        ...decayInsights,
        ...clusterInsights,
      ];

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Generate reinforcement recommendations
      const reinforcement = this.reinforcer.generate(insights);

      logger.info(
        { userId, habits: habits.length, insights: insights.length },
        'Processed habits'
      );

      return { habits, insights, reinforcement };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process habits');
      return { habits: [], insights: [], reinforcement: [] };
    }
  }

  /**
   * Build habit context from entries
   */
  private async buildContext(userId: string): Promise<HabitContext> {
    const context: HabitContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(300);

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get insights if available
      // TODO: Fetch from insight engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build habit context');
    }

    return context;
  }
}



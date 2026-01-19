import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { taskEngineService } from '../taskEngineService';

import { DependencyAnalyzer } from './dependencyAnalyzer';
import { GoalExtractor } from './goalExtractor';
import { GoalRecommender } from './goalRecommender';
import { GoalStateCalculator } from './goalStateCalculator';
import { MilestoneDetector } from './milestoneDetector';
import { StagnationDetector } from './stagnationDetector';
import { SuccessPredictor } from './successPredictor';
import type { Goal, GoalInsight, GoalContext } from './types';

/**
 * Main Goal Tracking Engine
 * Extracts, tracks, and analyzes goals
 */
export class GoalEngine {
  private extractor: GoalExtractor;
  private stateCalc: GoalStateCalculator;
  private milestones: MilestoneDetector;
  private stagnation: StagnationDetector;
  private deps: DependencyAnalyzer;
  private predictor: SuccessPredictor;
  private recommender: GoalRecommender;

  constructor() {
    this.extractor = new GoalExtractor();
    this.stateCalc = new GoalStateCalculator();
    this.milestones = new MilestoneDetector();
    this.stagnation = new StagnationDetector();
    this.deps = new DependencyAnalyzer();
    this.predictor = new SuccessPredictor();
    this.recommender = new GoalRecommender();
  }

  /**
   * Process goals for a user
   */
  async process(userId: string): Promise<{
    goals: Goal[];
    insights: GoalInsight[];
    recommendations: any[];
  }> {
    try {
      logger.debug({ userId }, 'Processing goals');

      // Build goal context
      const context = await this.buildContext(userId);

      // Extract goals
      const goals = this.extractor.extract(context);
      
      // Add user_id to all goals
      goals.forEach(g => { g.user_id = userId; });

      // Calculate states
      const stateInsights = this.stateCalc.calculate(goals, context);

      // Detect milestones
      const milestoneInsights = this.milestones.detect(goals, context);

      // Detect stagnation
      const stagnationInsights = this.stagnation.detect(goals, context);

      // Analyze dependencies
      const dependencyInsights = this.deps.analyze(goals, context);

      // Predict success
      const predictionInsights = await this.predictor.predict(goals);

      // Combine all insights
      const insights: GoalInsight[] = [
        ...stateInsights,
        ...milestoneInsights,
        ...stagnationInsights,
        ...dependencyInsights,
        ...predictionInsights,
      ];

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Generate recommendations
      const recommendations = this.recommender.recommend(insights);

      logger.info(
        { userId, goals: goals.length, insights: insights.length },
        'Processed goals'
      );

      return { goals, insights, recommendations };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process goals');
      return { goals: [], insights: [], recommendations: [] };
    }
  }

  /**
   * Build goal context from all sources
   */
  private async buildContext(userId: string): Promise<GoalContext> {
    const context: GoalContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);

      context.entries = entries || [];

      // Get tasks
      try {
        const tasks = await taskEngineService.listTasks(userId, { limit: 100 });
        context.tasks = tasks;
      } catch (error) {
        logger.error({ error }, 'Failed to fetch tasks');
        context.tasks = [];
      }

      // Get continuity data (for abandoned goals)
      try {
        const { continuityService } = await import('../continuity/continuityService');
        const continuityResult = await continuityService.runContinuityAnalysis(userId);
        context.continuity = {
          abandonedGoals: continuityResult.events
            .filter((e: any) => e.event_type === 'abandoned_goal')
            .map((e: any) => ({
              id: e.id,
              title: e.description || e.text,
              text: e.description || e.text,
              lastUpdateEventId: e.related_event_ids?.[0],
              daysSinceLastUpdate: e.metadata?.daysSinceLastUpdate || 0,
              confidence: e.confidence || 0.8,
            })),
        };
      } catch (error) {
        logger.error({ error }, 'Failed to fetch continuity data');
        context.continuity = { abandonedGoals: [] };
      }

      // Get arcs (if available)
      // TODO: Fetch from arc/timeline service if available

    } catch (error) {
      logger.error({ error }, 'Failed to build goal context');
    }

    return context;
  }
}


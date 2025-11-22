import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Decision, DecisionInsight, DecisionContext } from './types';
import { DecisionExtractor } from './decisionExtractor';
import { DecisionOutcomeMapper } from './decisionOutcomeMapper';
import { DecisionPatternDetector } from './patternDetector';
import { SimilarDecisionAnalyzer } from './similarityAnalyzer';
import { RiskAnalyzer } from './riskAnalyzer';
import { ConsequencePredictor } from './consequencePredictor';
import { DecisionRecommender } from './decisionRecommender';

/**
 * Main Decision Support Engine
 * Extracts, analyzes, and provides insights on decisions
 */
export class DecisionEngine {
  private extractor: DecisionExtractor;
  private outcomes: DecisionOutcomeMapper;
  private patterns: DecisionPatternDetector;
  private similarity: SimilarDecisionAnalyzer;
  private risk: RiskAnalyzer;
  private predictor: ConsequencePredictor;
  private recommender: DecisionRecommender;

  constructor() {
    this.extractor = new DecisionExtractor();
    this.outcomes = new DecisionOutcomeMapper();
    this.patterns = new DecisionPatternDetector();
    this.similarity = new SimilarDecisionAnalyzer();
    this.risk = new RiskAnalyzer();
    this.predictor = new ConsequencePredictor();
    this.recommender = new DecisionRecommender();
  }

  /**
   * Process decisions for a user
   */
  async process(userId: string): Promise<{
    decisions: Decision[];
    insights: DecisionInsight[];
    recommendations: any[];
  }> {
    try {
      logger.debug({ userId }, 'Processing decisions');

      // Build decision context
      const context = await this.buildContext(userId);

      // Extract decisions
      const decisions = this.extractor.extract(context);
      
      // Add user_id to all decisions
      decisions.forEach(d => { d.user_id = userId; });

      // Map outcomes
      const outcomeInsights = this.outcomes.mapOutcomes(decisions, context);

      // Detect patterns
      const patternInsights = this.patterns.detect(decisions);

      // Analyze risk
      const riskInsights = this.risk.analyze(decisions);

      // Analyze similarity
      const similarityInsights = await this.similarity.analyze(decisions);

      // Predict consequences
      const consequenceInsights = await this.predictor.predict(decisions);

      // Combine all insights
      const insights: DecisionInsight[] = [
        ...outcomeInsights,
        ...patternInsights,
        ...riskInsights,
        ...similarityInsights,
        ...consequenceInsights,
      ];

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Generate recommendations
      const recommendations = this.recommender.recommend(insights);

      logger.info(
        { userId, decisions: decisions.length, insights: insights.length },
        'Processed decisions'
      );

      return { decisions, insights, recommendations };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process decisions');
      return { decisions: [], insights: [], recommendations: [] };
    }
  }

  /**
   * Build decision context from entries
   */
  private async buildContext(userId: string): Promise<DecisionContext> {
    const context: DecisionContext = {};

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

      // Get insights if available
      // TODO: Fetch from insight engine if needed

      // Get learning data if available
      // TODO: Fetch from learning engine if needed

      // Get relationship data if available
      // TODO: Fetch from relationship analytics if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build decision context');
    }

    return context;
  }
}


import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  EQOutput,
  EQContext,
  EQInsight,
  EmotionType,
  TriggerType,
} from './types';
import { EmotionExtractor } from './emotionExtractor';
import { TriggerDetector } from './triggerDetector';
import { ReactionClassifier } from './reactionClassifier';
import { RegulationScorer } from './regulationScorer';
import { RecoveryModel } from './recoveryModel';
import { EQGrowthTracker } from './eqGrowthTracker';

/**
 * Main Emotional Intelligence Engine
 * Tracks emotional triggers, regulation, recovery, and EQ growth
 */
export class EQEngine {
  private extractor: EmotionExtractor;
  private triggerDetector: TriggerDetector;
  private reactionClassifier: ReactionClassifier;
  private regulationScorer: RegulationScorer;
  private recoveryModel: RecoveryModel;
  private growthTracker: EQGrowthTracker;

  constructor() {
    this.extractor = new EmotionExtractor();
    this.triggerDetector = new TriggerDetector();
    this.reactionClassifier = new ReactionClassifier();
    this.regulationScorer = new RegulationScorer();
    this.recoveryModel = new RecoveryModel();
    this.growthTracker = new EQGrowthTracker();
  }

  /**
   * Process emotional intelligence for a user
   */
  async process(userId: string): Promise<EQOutput> {
    try {
      logger.debug({ userId }, 'Processing emotional intelligence');

      // Build context
      const context = await this.buildContext(userId);

      // Extract emotion signals
      const signals = this.extractor.extract(context.entries || []);
      signals.forEach(s => { s.user_id = userId; });

      // Detect triggers
      const triggers = this.triggerDetector.detect(signals);
      triggers.forEach(t => { t.user_id = userId; });

      // Classify reactions
      const reactions = this.reactionClassifier.classify(signals);
      reactions.forEach(r => { r.user_id = userId; });

      // Compute regulation score
      const regulation = this.regulationScorer.compute(signals, reactions);

      // Compute recovery model
      const recovery = this.recoveryModel.compute(signals);

      // Track EQ growth
      const growth = this.growthTracker.track(regulation, signals, recovery);

      // Generate insights
      const insights: EQInsight[] = [];

      // Trigger insights
      triggers.forEach((t) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'trigger_detected',
          message: `Trigger detected: ${t.triggerType} → ${t.emotion.emotion}`,
          timestamp: t.emotion.timestamp,
          confidence: t.confidence,
          user_id: userId,
          emotion: t.emotion.emotion,
          triggerType: t.triggerType,
          metadata: {
            trigger_type: t.triggerType,
            emotion_type: t.emotion.emotion,
            intensity: t.emotion.intensity,
          },
        });
      });

      // High intensity insights
      const highIntensitySignals = signals.filter(s => s.intensity > 0.8);
      if (highIntensitySignals.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'high_intensity',
          message: `${highIntensitySignals.length} high-intensity emotional events detected.`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            count: highIntensitySignals.length,
            emotions: highIntensitySignals.map(s => s.emotion),
          },
        });
      }

      // Low regulation insights
      if (regulation.stability < 0.4) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'low_regulation',
          message: 'Low emotional stability detected. Consider regulation strategies.',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            stability_score: regulation.stability,
            overall_score: regulation.overall,
          },
        });
      }

      if (regulation.overall < 0.4) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'instability_risk',
          message: 'Emotional instability risk detected. Focus on regulation and recovery.',
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            regulation_score: regulation,
          },
        });
      }

      // Reaction pattern insights
      const reactionDistribution = this.reactionClassifier.getReactionDistribution(reactions);
      const maladaptiveReactions = reactions.filter(r => 
        r.type === 'impulsive' || r.type === 'reactive' || r.type === 'avoidant' || r.type === 'ruminative'
      );

      if (maladaptiveReactions.length > reactions.length * 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'reaction_pattern',
          message: 'High frequency of maladaptive reaction patterns detected.',
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            maladaptive_count: maladaptiveReactions.length,
            total_reactions: reactions.length,
            distribution: reactionDistribution,
          },
        });
      }

      // Emotional growth insights
      if (growth.growthPotential > 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'emotional_growth',
          message: `Strong emotional growth potential detected (${(growth.growthPotential * 100).toFixed(0)}%).`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            growth_potential: growth.growthPotential,
            regulation: regulation,
          },
        });
      }

      // Risk zone insights
      if (growth.riskZones.instability) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'instability_risk',
          message: 'Emotional instability risk zone detected.',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            risk_zone: 'instability',
          },
        });
      }

      if (growth.riskZones.impulsivity) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'reaction_pattern',
          message: 'High impulsivity risk detected. Consider pausing before reacting.',
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            risk_zone: 'impulsivity',
          },
        });
      }

      if (growth.riskZones.slowRecovery) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'recovery_slow',
          message: 'Slow emotional recovery detected. Consider recovery strategies.',
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            risk_zone: 'slow_recovery',
          },
        });
      }

      // Regulation improvement insights
      if (regulation.overall > 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'regulation_improvement',
          message: `Strong emotional regulation detected (${(regulation.overall * 100).toFixed(0)}% EQ score).`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            regulation_score: regulation,
          },
        });
      }

      // Trigger pattern insights
      const topTriggers = this.triggerDetector.getTopTriggers(triggers, 3);
      if (topTriggers.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'trigger_pattern',
          message: `Most common triggers: ${topTriggers.map(t => t.trigger).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            top_triggers: topTriggers,
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          signals: signals.length,
          triggers: triggers.length,
          reactions: reactions.length,
          regulation: regulation.overall,
          insights: insights.length,
        },
        'Processed emotional intelligence'
      );

      return {
        signals,
        triggers,
        reactions,
        regulation,
        recovery,
        growth,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process emotional intelligence');
      return {
        signals: [],
        triggers: [],
        reactions: [],
        regulation: {
          stability: 0.5,
          modulation: 0.5,
          delay: 0.5,
          resilience: 0.5,
          emotionalFlexibility: 0.5,
          overall: 0.5,
        },
        recovery: [],
        growth: {
          growthPotential: 0.5,
          riskZones: {
            instability: false,
            impulsivity: false,
            emotionalRigidity: false,
            slowRecovery: false,
          },
          trends: {
            stability_trend: 'stable',
            resilience_trend: 'stable',
            flexibility_trend: 'stable',
          },
        },
        insights: [],
      };
    }
  }

  /**
   * Build EQ context from entries
   */
  private async buildContext(userId: string): Promise<EQContext> {
    const context: EQContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for emotional analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get continuity data if available
      // TODO: Fetch from continuity engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get resilience data if available
      // TODO: Fetch from resilience engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build EQ context');
    }

    return context;
  }
}


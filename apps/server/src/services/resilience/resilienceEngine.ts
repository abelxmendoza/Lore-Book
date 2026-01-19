import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { BehavioralRecoveryAnalyzer } from './behavioralRecoveryAnalyzer';
import { CopingDetector } from './copingDetector';
import { DurabilityScorer } from './durabilityScorer';
import { EmotionalRecoveryAnalyzer } from './emotionalRecoveryAnalyzer';
import { GrowthAfterAdversity } from './growthAfterAdversity';
import { RecoveryCalculator } from './recoveryCalculator';
import { RecoveryTracker } from './recoveryTracker';
import { ResilienceScorer } from './resilienceScorer';
import { ResilienceTimeline } from './resilienceTimeline';
import { SetbackDetector } from './setbackDetector';
import { SetbackExtractor } from './setbackExtractor';
import { StressPatternDetector } from './stressPatternDetector';
import type { Setback, ResilienceInsight, ResilienceContext, ResilienceOutput, SetbackSignal, RecoverySignal } from './types';

/**
 * Main Resilience Engine
 * Detects setbacks, tracks recovery, and measures resilience
 */
export class ResilienceEngine {
  // Original components (for backward compatibility)
  private setbacks: SetbackDetector;
  private recoveryTracker: RecoveryTracker;
  private emotional: EmotionalRecoveryAnalyzer;
  private behavioral: BehavioralRecoveryAnalyzer;
  private growth: GrowthAfterAdversity;
  private scorer: ResilienceScorer;

  // New blueprint components
  private setbackExtractor: SetbackExtractor;
  private recoveryCalculator: RecoveryCalculator;
  private copingDetector: CopingDetector;
  private timeline: ResilienceTimeline;
  private durabilityScorer: DurabilityScorer;
  private stressPattern: StressPatternDetector;

  constructor() {
    // Original components
    this.setbacks = new SetbackDetector();
    this.recoveryTracker = new RecoveryTracker();
    this.emotional = new EmotionalRecoveryAnalyzer();
    this.behavioral = new BehavioralRecoveryAnalyzer();
    this.growth = new GrowthAfterAdversity();
    this.scorer = new ResilienceScorer();

    // New blueprint components
    this.setbackExtractor = new SetbackExtractor();
    this.recoveryCalculator = new RecoveryCalculator();
    this.copingDetector = new CopingDetector();
    this.timeline = new ResilienceTimeline();
    this.durabilityScorer = new DurabilityScorer();
    this.stressPattern = new StressPatternDetector();
  }

  /**
   * Process resilience for a user (original method for backward compatibility)
   */
  async process(userId: string): Promise<{
    setbacks: Setback[];
    insights: ResilienceInsight[];
    resilienceScore?: number;
  }> {
    const output = await this.processEnhanced(userId);
    
    // Convert to original format for backward compatibility
    const setbacks: Setback[] = (output.setbacks || []).map(s => ({
      id: s.id,
      user_id: s.user_id,
      timestamp: s.timestamp,
      reason: s.text,
      severity: s.severity > 0.7 ? 'high' : s.severity > 0.4 ? 'medium' : 'low' as const,
      category: s.type,
      metadata: s.metadata,
    }));
    
    return {
      setbacks,
      insights: output.insights,
      resilienceScore: output.resilienceScore,
    };
  }

  /**
   * Enhanced process method with new blueprint components
   */
  async processEnhanced(userId: string): Promise<ResilienceOutput> {
    try {
      logger.debug({ userId }, 'Processing resilience (enhanced)');

      // Build resilience context
      const context = await this.buildContext(userId);

      // ===== NEW BLUEPRINT COMPONENTS =====
      
      // Extract setback signals (new method)
      const setbackSignals = this.setbackExtractor.extract(context);
      setbackSignals.forEach(s => { s.user_id = userId; });

      // Calculate recovery signals
      const recoverySignals = this.recoveryCalculator.calculateRecovery(setbackSignals, context.entries || []);

      // Build resilience timeline
      const timeline = this.timeline.build(setbackSignals, recoverySignals);

      // Detect coping strategies
      const coping = this.copingDetector.detect(context.entries || []);

      // Calculate resilience score (new method)
      const resilienceScore = this.durabilityScorer.score(timeline);
      const recoverySpeed = this.durabilityScorer.calculateRecoverySpeed(timeline);

      // Detect stress patterns
      const highStressPeriods = this.stressPattern.detect(timeline);
      const chronicStress = this.stressPattern.detectChronicStress(timeline);
      const emotionalCycling = this.stressPattern.detectEmotionalCycling(timeline);

      // ===== ORIGINAL COMPONENTS (for additional insights) =====
      
      // Detect setbacks (original method) - convert SetbackSignal[] to Setback[]
      const setbackSignalsForOriginal = setbackSignals.map(s => ({
        id: s.id,
        user_id: s.user_id,
        timestamp: s.timestamp,
        reason: s.text,
        severity: s.severity > 0.7 ? 'high' : s.severity > 0.4 ? 'medium' : 'low' as const,
        category: s.type,
        metadata: s.metadata,
      }));
      
      // Also use original detector for additional insights
      const setbacks = this.setbacks.detect(context);
      setbacks.forEach(s => { s.user_id = userId; });

      // Track recovery (original method)
      const recoveryInsights = this.recoveryTracker.track(setbacks, context);

      // Analyze emotional recovery
      const emotionalInsights = this.emotional.analyze(setbacks, context);

      // Analyze behavioral recovery
      const behavioralInsights = this.behavioral.analyze(context);

      // Analyze growth after adversity
      const growthInsights = this.growth.analyze(setbacks, context);

      // ===== COMBINE INSIGHTS =====
      
      const insights: ResilienceInsight[] = [
        ...recoveryInsights,
        ...emotionalInsights,
        ...behavioralInsights,
        ...growthInsights,
      ];

      // Add insights from new components
      setbackSignals.forEach(s => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'setback_detected',
          message: `Setback detected: ${s.type}`,
          timestamp: s.timestamp,
          confidence: 0.9,
          user_id: userId,
          metadata: {
            setback_type: s.type,
            severity: s.severity,
          },
        });
      });

      recoverySignals.forEach((r, i) => {
        if (r.improvement > 0.2) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'recovery_started',
            message: 'Recovery detected after setback.',
            timestamp: setbackSignals[i]?.timestamp || r.timestamp,
            confidence: 0.85,
            user_id: userId,
            metadata: {
              improvement: r.improvement,
              recovery_duration_days: r.recovery_duration_days,
            },
          });
        }
      });

      // Coping strategy insights
      const copingSummary = this.copingDetector.getSummary(coping);
      if (coping.negative_count > coping.positive_count) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'self_sabotage_loop',
          message: 'Negative coping patterns outweigh positive ones.',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            positive_count: coping.positive_count,
            negative_count: coping.negative_count,
            ratio: coping.ratio,
          },
        });
      }

      // Chronic stress insight
      if (chronicStress.isChronic) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'chronic_stress_pattern',
          message: chronicStress.message,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            frequency: chronicStress.frequency,
            periods: chronicStress.periods.length,
          },
        });
      }

      // Emotional cycling insight
      if (emotionalCycling.isCycling) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'emotional_cycling',
          message: emotionalCycling.message,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            cycle_count: emotionalCycling.cycleCount,
            average_cycle_length: emotionalCycling.averageCycleLength,
          },
        });
      }

      // Resilience breakthrough insight
      if (resilienceScore > 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'resilience_breakthrough',
          message: `Your resilience score is ${(resilienceScore * 100).toFixed(0)}% - showing strong recovery patterns.`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            resilience_score: resilienceScore,
            recovery_speed: recoverySpeed,
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          setbacks: setbacks.length,
          setbackSignals: setbackSignals.length,
          insights: insights.length,
          resilienceScore,
          recoverySpeed,
        },
        'Processed resilience (enhanced)'
      );

      return {
        resilienceScore,
        recoverySpeed,
        highStressPeriods,
        insights,
        setbacks: setbackSignals,
        recovery: recoverySignals,
        timeline,
        coping,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process resilience');
      return {
        resilienceScore: 0,
        recoverySpeed: 0,
        highStressPeriods: [],
        insights: [],
      };
    }
  }

  /**
   * Build resilience context from entries
   */
  private async buildContext(userId: string): Promise<ResilienceContext> {
    const context: ResilienceContext = {};

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
      // For now, we'll extract sentiment from entries if available

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get insights if available
      // TODO: Fetch from insight engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build resilience context');
    }

    return context;
  }
}


import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { CycleDetector } from './cycleDetector';
import { EnergyExtractor } from './energyExtractor';
import { RecoveryPredictor } from './recoveryPredictor';
import { SleepExtractor } from './sleepExtractor';
import { StressCorrelation } from './stressCorrelation';
import { SymptomExtractor } from './symptomExtractor';
import type {
  HealthOutput,
  HealthContext,
  HealthInsight,
  SymptomType,
} from './types';
import { WellnessScoreService } from './wellnessScore';

/**
 * Main Health & Wellness Engine
 * Tracks physical health, symptoms, wellness cycles, and recovery
 */
export class HealthEngine {
  private symptomExtractor: SymptomExtractor;
  private sleepExtractor: SleepExtractor;
  private energyExtractor: EnergyExtractor;
  private stressCorrelation: StressCorrelation;
  private cycleDetector: CycleDetector;
  private recoveryPredictor: RecoveryPredictor;
  private wellnessScore: WellnessScoreService;

  constructor() {
    this.symptomExtractor = new SymptomExtractor();
    this.sleepExtractor = new SleepExtractor();
    this.energyExtractor = new EnergyExtractor();
    this.stressCorrelation = new StressCorrelation();
    this.cycleDetector = new CycleDetector();
    this.recoveryPredictor = new RecoveryPredictor();
    this.wellnessScore = new WellnessScoreService();
  }

  /**
   * Process health and wellness for a user
   */
  async process(userId: string): Promise<HealthOutput> {
    try {
      logger.debug({ userId }, 'Processing health and wellness');

      // Build context
      const context = await this.buildContext(userId);

      // Extract health events
      const symptoms = this.symptomExtractor.extract(context.entries || []);
      symptoms.forEach(s => { s.user_id = userId; });

      const sleep = this.sleepExtractor.extract(context.entries || []);
      sleep.forEach(s => { s.user_id = userId; });

      const energy = this.energyExtractor.extract(context.entries || []);
      energy.forEach(e => { e.user_id = userId; });

      // Extract stress signals from entries (simplified)
      const stressSignals = (context.entries || []).map((e: any) => {
        const content = (e.content || e.text || '').toLowerCase();
        if (content.includes('stressed') || content.includes('overwhelmed') || content.includes('pressure')) {
          return 0.7;
        }
        return e.stress || 0.4;
      });

      // Compute stress correlations
      const correlations = this.stressCorrelation.compute(stressSignals, symptoms, sleep, energy);

      // Detect wellness cycles
      const cycles = this.cycleDetector.detect(energy, symptoms, sleep);

      // Predict recovery
      const recovery = this.recoveryPredictor.predict(symptoms);

      // Compute wellness score
      const score = this.wellnessScore.compute(symptoms, sleep, energy, recovery);

      // Generate insights
      const insights: HealthInsight[] = [];

      // Symptom insights
      const symptomCounts: Record<SymptomType, number> = {} as Record<SymptomType, number>;
      symptoms.forEach(s => {
        symptomCounts[s.type] = (symptomCounts[s.type] || 0) + 1;
      });

      Object.entries(symptomCounts)
        .filter(([_, count]) => count >= 3)
        .forEach(([type, count]) => {
          insights.push({
            id: crypto.randomUUID(),
            type: 'symptom_detected',
            message: `Recurring symptom detected: ${type} (${count} occurrences)`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            user_id: userId,
            metadata: {
              symptom_type: type,
              count,
            },
          });
        });

      // Sleep issue insights
      const poorSleep = sleep.filter(s => s.quality !== null && s.quality < 0.4);
      if (poorSleep.length > sleep.length * 0.3) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'sleep_issue',
          message: `Sleep quality concerns detected (${poorSleep.length} poor sleep events).`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            poor_sleep_count: poorSleep.length,
            total_sleep_events: sleep.length,
          },
        });
      }

      // Low energy insights
      const lowEnergy = energy.filter(e => e.level < 0.3);
      if (lowEnergy.length > energy.length * 0.3) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'low_energy',
          message: `Low energy levels detected (${lowEnergy.length} low energy events).`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            low_energy_count: lowEnergy.length,
            total_energy_events: energy.length,
          },
        });
      }

      // Stress correlation insights
      if (Math.abs(correlations.symptomCorrelation) > 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'stress_correlation',
          message: `Strong correlation between stress and symptoms (${(correlations.symptomCorrelation * 100).toFixed(0)}%).`,
          timestamp: new Date().toISOString(),
          confidence: correlations.confidence,
          user_id: userId,
          metadata: {
            correlation: correlations.symptomCorrelation,
            stress_level: correlations.stressLevel,
          },
        });
      }

      // Cycle insights
      cycles.forEach(cycle => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'cycle_detected',
          message: `${cycle.cycleType} wellness cycle detected.`,
          timestamp: new Date().toISOString(),
          confidence: cycle.confidence || 0.6,
          user_id: userId,
          metadata: {
            cycle_type: cycle.cycleType,
            phases: cycle.phases,
          },
        });
      });

      // Recovery insights
      if (recovery.expectedDaysToRecover > 7) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'recovery_needed',
          message: `Extended recovery period predicted (${recovery.expectedDaysToRecover} days).`,
          timestamp: new Date().toISOString(),
          confidence: recovery.confidence,
          user_id: userId,
          metadata: {
            expected_days: recovery.expectedDaysToRecover,
            current_intensity: recovery.currentIntensity,
          },
        });
      }

      // Wellness improvement/decline insights
      const wellnessCategory = this.wellnessScore.getCategory(score.overall);
      if (wellnessCategory === 'excellent' || wellnessCategory === 'good') {
        insights.push({
          id: crypto.randomUUID(),
          type: 'wellness_improvement',
          message: `Wellness score: ${(score.overall * 100).toFixed(0)}% (${wellnessCategory}).`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            score: score.overall,
            category: wellnessCategory,
          },
        });
      } else if (wellnessCategory === 'poor' || wellnessCategory === 'critical') {
        insights.push({
          id: crypto.randomUUID(),
          type: 'wellness_decline',
          message: `Wellness score: ${(score.overall * 100).toFixed(0)}% (${wellnessCategory}). Consider health interventions.`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            score: score.overall,
            category: wellnessCategory,
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          symptoms: symptoms.length,
          sleep: sleep.length,
          energy: energy.length,
          cycles: cycles.length,
          wellnessScore: score.overall,
          insights: insights.length,
        },
        'Processed health and wellness'
      );

      return {
        symptoms,
        sleep,
        energy,
        correlations,
        cycles,
        recovery,
        score,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process health and wellness');
      return {
        symptoms: [],
        sleep: [],
        energy: [],
        correlations: {
          stressLevel: 0,
          symptomCorrelation: 0,
          sleepCorrelation: 0,
          energyCorrelation: 0,
          confidence: 0,
        },
        cycles: [],
        recovery: {
          expectedDaysToRecover: 0,
          confidence: 0,
          predictedCurve: [],
        },
        score: {
          physical: 0.5,
          mental: 0.5,
          sleep: 0.5,
          recovery: 0.5,
          overall: 0.5,
        },
        insights: [],
      };
    }
  }

  /**
   * Build health context from entries
   */
  private async buildContext(userId: string): Promise<HealthContext> {
    const context: HealthContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for health analysis

      context.entries = entries || [];

      // Get identity pulse data if available (for mood/stress)
      // TODO: Fetch from identity pulse service if needed

      // Get resilience data if available
      // TODO: Fetch from resilience engine if needed

      // Get emotional intelligence data if available
      // TODO: Fetch from EQ engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build health context');
    }

    return context;
  }
}


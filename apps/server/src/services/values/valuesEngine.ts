import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { AlignmentDetector } from './alignmentDetector';
import { BeliefEvolution } from './beliefEvolution';
import { BeliefExtractor } from './beliefExtractor';
import type {
  ValuesOutput,
  ValuesContext,
  ValueInsight,
  ValueCategory,
} from './types';
import { ValueClassifier } from './valueClassifier';
import { ValueConflictDetector } from './valueConflictDetector';
import { ValueEvolution } from './valueEvolution';
import { ValueExtractor } from './valueExtractor';

/**
 * Main Values & Beliefs Engine
 * Tracks core values, beliefs, conflicts, and alignment
 */
export class ValuesEngine {
  private valueExtractor: ValueExtractor;
  private beliefExtractor: BeliefExtractor;
  private classifier: ValueClassifier;
  private conflictDetector: ValueConflictDetector;
  private alignmentDetector: AlignmentDetector;
  private valueEvolution: ValueEvolution;
  private beliefEvolution: BeliefEvolution;

  constructor() {
    this.valueExtractor = new ValueExtractor();
    this.beliefExtractor = new BeliefExtractor();
    this.classifier = new ValueClassifier();
    this.conflictDetector = new ValueConflictDetector();
    this.alignmentDetector = new AlignmentDetector();
    this.valueEvolution = new ValueEvolution();
    this.beliefEvolution = new BeliefEvolution();
  }

  /**
   * Process values and beliefs for a user
   */
  async process(userId: string): Promise<ValuesOutput> {
    try {
      logger.debug({ userId }, 'Processing values and beliefs');

      // Build context
      const context = await this.buildContext(userId);

      // Extract value signals
      const valueSignals = this.valueExtractor.extract(context.entries || []);
      valueSignals.forEach(s => { s.user_id = userId; });

      // Extract belief signals
      const beliefSignals = this.beliefExtractor.extract(context.entries || []);
      beliefSignals.forEach(b => { b.user_id = userId; });

      // Classify values
      const groups = this.classifier.groupByCategory(valueSignals);
      const coreValues = this.classifier.detectCoreValues(groups);

      // Detect conflicts
      const conflicts = this.conflictDetector.detect(groups);

      // Detect misalignments
      const misalignments = this.alignmentDetector.detectAlignment(coreValues, context.entries || []);

      // Build evolution timelines
      const valueTimeline = this.valueEvolution.buildTimeline(valueSignals);
      const beliefTimeline = this.beliefEvolution.buildTimeline(beliefSignals);

      // Generate insights
      const insights: ValueInsight[] = [];

      // Core value insights
      coreValues.forEach((v) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'core_value_detected',
          category: v as ValueCategory,
          message: `Core value identified: ${v}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            value_category: v,
            signal_count: groups[v]?.length || 0,
          },
        });
      });

      // Conflict insights
      conflicts.forEach((c) => {
        const severity = this.conflictDetector.getConflictSeverity(groups, c);
        insights.push({
          id: crypto.randomUUID(),
          type: 'value_conflict',
          message: `Value conflict detected: ${c.replace(/_/g, ' ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            conflict_name: c,
            severity,
          },
        });
      });

      // Misalignment insights
      misalignments.forEach((m) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'misalignment',
          message: `Misalignment detected: ${m}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            misalignment: m,
          },
        });
      });

      // Value shift insights
      const valueShifts = this.valueEvolution.detectShifts(valueTimeline);
      valueShifts.forEach((shift) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'value_shift',
          category: shift.category as ValueCategory,
          message: `Value shift detected: ${shift.category} is ${shift.shift}`,
          timestamp: shift.period.end,
          confidence: 0.75,
          user_id: userId,
          metadata: {
            shift_type: shift.shift,
            magnitude: shift.magnitude,
            period: shift.period,
          },
        });
      });

      // Belief shift insights
      const beliefShifts = this.beliefEvolution.detectShifts(beliefTimeline);
      beliefShifts.forEach((shift) => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'belief_shift',
          message: `Belief shift detected: ${shift.shift} change`,
          timestamp: shift.period.end,
          confidence: 0.7,
          user_id: userId,
          metadata: {
            shift_type: shift.shift,
            magnitude: shift.magnitude,
            statement: shift.statement.substring(0, 100),
          },
        });
      });

      // Reinforced value insights (values that are consistently strong)
      const valueStats = this.classifier.getValueStats(groups);
      valueStats
        .filter(stat => stat.averageStrength > 0.7 && stat.count >= 3)
        .forEach(stat => {
          if (coreValues.includes(stat.category)) {
            insights.push({
              id: crypto.randomUUID(),
              type: 'reinforced_value',
              category: stat.category,
              message: `Value reinforced: ${stat.category} appears consistently strong`,
              timestamp: new Date().toISOString(),
              confidence: 0.85,
              user_id: userId,
              metadata: {
                count: stat.count,
                average_strength: stat.averageStrength,
              },
            });
          }
        });

      // Emerging value insights (new values appearing)
      const recentSignals = valueSignals.filter(s => {
        const signalDate = new Date(s.timestamp);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return signalDate > thirtyDaysAgo;
      });

      const recentCategories = new Set(recentSignals.map(s => s.category));
      const oldCategories = new Set(
        valueSignals
          .filter(s => {
            const signalDate = new Date(s.timestamp);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return signalDate <= thirtyDaysAgo;
          })
          .map(s => s.category)
      );

      recentCategories.forEach(cat => {
        if (!oldCategories.has(cat)) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'emerging_value',
            category: cat as ValueCategory,
            message: `Emerging value detected: ${cat}`,
            timestamp: new Date().toISOString(),
            confidence: 0.7,
            user_id: userId,
            metadata: {
              category: cat,
            },
          });
        }
      });

      logger.info(
        {
          userId,
          coreValues: coreValues.length,
          conflicts: conflicts.length,
          misalignments: misalignments.length,
          insights: insights.length,
          valueSignals: valueSignals.length,
          beliefSignals: beliefSignals.length,
        },
        'Processed values and beliefs'
      );

      return {
        coreValues,
        valueClusters: groups,
        beliefStatements: beliefSignals,
        conflicts,
        misalignments,
        evolution: {
          values: valueTimeline,
          beliefs: beliefTimeline,
        },
        insights,
        valueSignals,
        beliefSignals,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process values and beliefs');
      return {
        coreValues: [],
        valueClusters: {},
        beliefStatements: [],
        conflicts: [],
        misalignments: [],
        evolution: {
          values: [],
          beliefs: [],
        },
        insights: [],
      };
    }
  }

  /**
   * Build values context from entries
   */
  private async buildContext(userId: string): Promise<ValuesContext> {
    const context: ValuesContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for values/beliefs analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get continuity data if available
      // TODO: Fetch from continuity engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build values context');
    }

    return context;
  }
}


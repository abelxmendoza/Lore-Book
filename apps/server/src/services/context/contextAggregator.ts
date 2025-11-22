import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { parseISO, differenceInDays, isBefore, isAfter, isEqual } from 'date-fns';
import type {
  TemporalContext,
  EmotionalContext,
  RelationshipContext,
  LearningContext,
  WisdomContext,
  PatternContext,
  GoalContext,
  RecommendationContext,
  ContextScope,
} from './types';
import { ChronologyEngine, EventMapper } from '../chronology';
import { relationshipAnalyticsModule } from '../analytics';
import { identityPulseModule } from '../analytics';
import { learningStorageService } from '../learning';
import { wisdomStorageService } from '../wisdom';
import { insightEngineModule } from '../analytics';
import { recommendationStorageService } from '../recommendation';

/**
 * Aggregates context from all engines
 */
export class ContextAggregator {
  private chronologyEngine: ChronologyEngine;
  private eventMapper: EventMapper;

  constructor() {
    this.chronologyEngine = new ChronologyEngine();
    this.eventMapper = new EventMapper();
  }

  /**
   * Get temporal context
   */
  async getTemporalContext(
    userId: string,
    centerDate: string,
    scope: ContextScope
  ): Promise<TemporalContext> {
    try {
      const center = parseISO(centerDate);
      const { startDate, endDate } = this.getDateRange(center, scope);

      // Get entries in range
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .order('date', { ascending: true });

      if (!entries) {
        return {
          date: centerDate,
          scope,
          before: [],
          during: [],
          after: [],
          gaps: [],
        };
      }

      // Categorize entries
      const before: string[] = [];
      const during: string[] = [];
      const after: string[] = [];

      entries.forEach(entry => {
        const entryDate = parseISO(entry.date);
        if (isBefore(entryDate, center)) {
          before.push(entry.id);
        } else if (isAfter(entryDate, center)) {
          after.push(entry.id);
        } else {
          during.push(entry.id);
        }
      });

      // Detect gaps
      const gaps = this.detectGaps(entries.map(e => e.date));

      return {
        date: centerDate,
        scope,
        before,
        during,
        after,
        gaps,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get temporal context');
      return {
        date: centerDate,
        scope,
        before: [],
        during: [],
        after: [],
        gaps: [],
      };
    }
  }

  /**
   * Get emotional context
   */
  async getEmotionalContext(
    userId: string,
    centerDate: string,
    scope: ContextScope
  ): Promise<EmotionalContext> {
    try {
      const center = parseISO(centerDate);
      const { startDate, endDate } = this.getDateRange(center, scope);

      // Get entries with mood/sentiment
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, mood, sentiment')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .order('date', { ascending: false })
        .limit(30);

      if (!entries || entries.length === 0) {
        return {
          mood: null,
          sentiment: 0,
          emotional_trajectory: 'stable',
          recent_emotions: [],
        };
      }

      // Get current mood (most recent)
      const currentMood = entries[0]?.mood || null;
      const currentSentiment = entries[0]?.sentiment || 0;

      // Calculate trajectory
      const sentiments = entries
        .filter(e => e.sentiment !== null)
        .map(e => e.sentiment as number)
        .slice(0, 10);

      let trajectory: 'rising' | 'falling' | 'stable' = 'stable';
      if (sentiments.length >= 2) {
        const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
        const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        if (secondAvg > firstAvg + 0.1) trajectory = 'rising';
        else if (secondAvg < firstAvg - 0.1) trajectory = 'falling';
      }

      // Recent emotions
      const recentEmotions = entries
        .filter(e => e.mood && e.sentiment !== null)
        .slice(0, 10)
        .map(e => ({
          date: e.date,
          mood: e.mood || 'neutral',
          sentiment: e.sentiment || 0,
        }));

      return {
        mood: currentMood,
        sentiment: currentSentiment,
        emotional_trajectory: trajectory,
        recent_emotions: recentEmotions,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get emotional context');
      return {
        mood: null,
        sentiment: 0,
        emotional_trajectory: 'stable',
        recent_emotions: [],
      };
    }
  }

  /**
   * Get relationship context
   */
  async getRelationshipContext(
    userId: string,
    centerDate: string
  ): Promise<RelationshipContext> {
    try {
      // Get relationship analytics
      const analytics = await relationshipAnalyticsModule.run(userId);
      const graph = (analytics.graph as any)?.nodes || [];
      const lifecycle = (analytics.charts as any[])?.find(
        (c: any) => c.type === 'lifecycle'
      )?.data || [];

      // Get recent entries to find last interactions
      const { data: recentEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, people')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      const activeRelationships = graph.slice(0, 10).map((node: any) => {
        const characterName = node.name || node.id;
        const phase = lifecycle.find(
          (l: any) => l.characterId === node.id || l.characterName === characterName
        );
        
        // Find last interaction
        const lastEntry = recentEntries?.find(e => 
          (e.people || []).includes(characterName)
        );

        return {
          name: characterName,
          closeness: node.degree || 0,
          last_interaction: lastEntry?.date || centerDate,
          status: phase?.phase === 'rise' ? 'rising' : phase?.phase === 'decline' ? 'falling' : 'stable',
        };
      });

      return {
        active_relationships: activeRelationships,
        relationship_changes: [], // Could be enhanced with continuity events
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get relationship context');
      return {
        active_relationships: [],
        relationship_changes: [],
      };
    }
  }

  /**
   * Get learning context
   */
  async getLearningContext(
    userId: string,
    centerDate: string
  ): Promise<LearningContext> {
    try {
      const learning = await learningStorageService.getLearningRecords(userId, {
        limit: 20,
        orderBy: 'date',
      });

      const center = parseISO(centerDate);
      const recentLearning = learning.filter(l => {
        const learnedDate = parseISO(l.source_date);
        return isBefore(learnedDate, center) || isEqual(learnedDate, center);
      }).slice(0, 10);

      const patterns = await learningStorageService.getLearningPatterns(userId);
      const avgGrowthRate = patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.growth_rate, 0) / patterns.length
        : 0;

      return {
        skills_learned: recentLearning.map(l => ({
          name: l.name,
          type: l.type,
          proficiency: l.proficiency,
          date: l.source_date,
        })),
        learning_velocity: avgGrowthRate,
        active_learning_areas: patterns
          .sort((a, b) => b.growth_rate - a.growth_rate)
          .slice(0, 5)
          .map(p => p.theme),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get learning context');
      return {
        skills_learned: [],
        learning_velocity: 0,
        active_learning_areas: [],
      };
    }
  }

  /**
   * Get wisdom context
   */
  async getWisdomContext(
    userId: string,
    centerDate: string
  ): Promise<WisdomContext> {
    try {
      const wisdom = await wisdomStorageService.getWisdomStatements(userId, {
        limit: 10,
        orderBy: 'date',
      });

      const patterns = await wisdomStorageService.getWisdomPatterns(userId);

      return {
        relevant_wisdom: wisdom.slice(0, 5).map(w => ({
          statement: w.statement,
          category: w.category,
          date: w.source_date,
        })),
        recurring_themes: patterns
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 5)
          .map(p => p.theme),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get wisdom context');
      return {
        relevant_wisdom: [],
        recurring_themes: [],
      };
    }
  }

  /**
   * Get pattern context
   */
  async getPatternContext(
    userId: string,
    centerDate: string
  ): Promise<PatternContext> {
    try {
      // Get insights
      const insights = await insightEngineModule.run(userId);
      const insightsList = (insights.insights as any[]) || [];

      // Get continuity events
      const { data: continuityEvents } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        behavioral_patterns: insightsList
          .filter((i: any) => i.type === 'behavioral_loop' || i.type === 'cyclic_behavior')
          .slice(0, 5)
          .map((i: any) => ({
            pattern: i.description || 'Unknown pattern',
            frequency: i.confidence || 0,
            last_seen: centerDate,
          })),
        continuity_events: (continuityEvents || []).map((e: any) => ({
          type: e.event_type,
          description: e.description,
          date: e.created_at,
        })),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get pattern context');
      return {
        behavioral_patterns: [],
        continuity_events: [],
      };
    }
  }

  /**
   * Get goal context
   */
  async getGoalContext(
    userId: string,
    centerDate: string
  ): Promise<GoalContext> {
    try {
      // Get continuity events for goals
      const { data: goalEvents } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .eq('event_type', 'abandoned_goal')
        .order('created_at', { ascending: false })
        .limit(10);

      const activeGoals = (goalEvents || []).map((e: any) => ({
        goal: (e.metadata as any)?.goal_text || 'Unknown goal',
        status: 'abandoned' as const,
        last_mentioned: e.created_at,
      }));

      return {
        active_goals: activeGoals,
        goal_progress: [],
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get goal context');
      return {
        active_goals: [],
        goal_progress: [],
      };
    }
  }

  /**
   * Get recommendation context
   */
  async getRecommendationContext(
    userId: string
  ): Promise<RecommendationContext> {
    try {
      const recommendations = await recommendationStorageService.getActiveRecommendations(userId, 5);

      return {
        recommendations: recommendations.map(r => ({
          type: r.type,
          title: r.title,
          description: r.description,
          priority: r.priority,
        })),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get recommendation context');
      return {
        recommendations: [],
      };
    }
  }

  /**
   * Get date range for scope
   */
  private getDateRange(center: Date, scope: ContextScope): { startDate: Date; endDate: Date } {
    const startDate = new Date(center);
    const endDate = new Date(center);

    switch (scope) {
      case 'moment':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      case 'lifetime':
        startDate.setFullYear(1900);
        endDate.setFullYear(2100);
        break;
    }

    return { startDate, endDate };
  }

  /**
   * Detect gaps in dates
   */
  private detectGaps(dates: string[]): Array<{ start: string; end: string; duration_days: number }> {
    if (dates.length < 2) return [];

    const sorted = [...dates].sort();
    const gaps: Array<{ start: string; end: string; duration_days: number }> = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const start = parseISO(sorted[i]);
      const end = parseISO(sorted[i + 1]);
      const diff = differenceInDays(end, start);

      if (diff > 7) { // Gap > 7 days
        gaps.push({
          start: sorted[i],
          end: sorted[i + 1],
          duration_days: diff,
        });
      }
    }

    return gaps;
  }
}


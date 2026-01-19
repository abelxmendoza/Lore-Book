// =====================================================
// ENTITY MEANING DRIFT SERVICE
// Purpose: Detect and track how entity meaning evolves over time
// Not judgment. Pure observation + user-confirmed transitions.
// =====================================================

import { logger } from '../logger';

import { entityResolutionService } from './entityResolutionService';
import type { EntityType } from './entityResolutionService';
import { supabaseAdmin } from './supabaseClient';

export type DominantContext = 
  | 'Work' 
  | 'Family' 
  | 'Romantic' 
  | 'Social' 
  | 'Personal' 
  | 'Professional' 
  | 'Academic'
  | 'Health'
  | 'Financial'
  | 'Creative'
  | 'Other';

export type SentimentMode = 'POSITIVE' | 'MIXED' | 'NEGATIVE' | 'NEUTRAL';
export type ImportanceLevel = 'High' | 'Moderate' | 'Low' | 'Background';
export type TransitionType = 
  | 'ROLE_SHIFT' 
  | 'SENTIMENT_SHIFT' 
  | 'IMPORTANCE_SHIFT' 
  | 'CONTEXT_SHIFT' 
  | 'MULTIPLE_SHIFTS';

export interface EntityMeaningSnapshot {
  id: string;
  user_id: string;
  entity_id: string;
  entity_type: EntityType;
  timeframe_start: string;
  timeframe_end: string | null;
  dominant_context: DominantContext | null;
  sentiment_mode: SentimentMode | null;
  importance_level: ImportanceLevel | null;
  mention_frequency: number | null;
  confidence: number;
  signals: Record<string, any>;
  user_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityMeaningTransition {
  id: string;
  user_id: string;
  entity_id: string;
  entity_type: EntityType;
  from_snapshot_id: string | null;
  to_snapshot_id: string | null;
  transition_type: TransitionType;
  detected_at: string;
  user_confirmed: boolean;
  user_confirmed_at: string | null;
  note: string | null;
  confidence: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface MeaningDriftSignal {
  entity_id: string;
  entity_type: EntityType;
  signal_strength: number; // 0-1
  detected_shifts: {
    context?: { from: DominantContext | null; to: DominantContext | null };
    sentiment?: { from: SentimentMode | null; to: SentimentMode | null };
    importance?: { from: ImportanceLevel | null; to: ImportanceLevel | null };
  };
  evidence: {
    context_mentions: Record<string, number>;
    sentiment_scores: { recent: number; historical: number };
    mention_frequency: { recent: number; historical: number };
    meta_overrides?: string[];
  };
}

// Detection thresholds
const DRIFT_THRESHOLD = 0.65; // Minimum signal strength to propose transition
const MIN_DAYS_FOR_COMPARISON = 30; // Need at least 30 days of recent data
const HISTORICAL_WINDOW_DAYS = 90; // Compare against last 90 days
const RECENT_WINDOW_DAYS = 30; // Recent 30 days

export class EntityMeaningDriftService {
  /**
   * Detect meaning drift for an entity by comparing recent vs historical usage
   */
  async detectMeaningDrift(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<MeaningDriftSignal | null> {
    try {
      // Get current snapshot (if exists)
      const currentSnapshot = await this.getCurrentSnapshot(userId, entityId, entityType);
      
      // Get recent mentions (last 30 days)
      const recentMentions = await this.getMentionsInWindow(
        userId,
        entityId,
        entityType,
        RECENT_WINDOW_DAYS
      );

      // Need sufficient recent data
      if (recentMentions.length < 3) {
        return null; // Not enough data to detect drift
      }

      // Get historical mentions (30-90 days ago, or from current snapshot period)
      const historicalStart = currentSnapshot?.timeframe_start 
        ? new Date(currentSnapshot.timeframe_start)
        : new Date(Date.now() - HISTORICAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      
      const historicalEnd = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      
      const historicalMentions = await this.getMentionsInWindow(
        userId,
        entityId,
        entityType,
        HISTORICAL_WINDOW_DAYS,
        historicalStart,
        historicalEnd
      );

      if (historicalMentions.length < 3) {
        return null; // Not enough historical data
      }

      // Analyze signals
      const signals = this.analyzeSignals(
        recentMentions,
        historicalMentions,
        currentSnapshot
      );

      // Calculate overall signal strength
      const signalStrength = this.calculateSignalStrength(signals);

      if (signalStrength < DRIFT_THRESHOLD) {
        return null; // Not strong enough
      }

      return {
        entity_id: entityId,
        entity_type: entityType,
        signal_strength: signalStrength,
        detected_shifts: signals.shifts,
        evidence: signals.evidence,
      };
    } catch (error) {
      logger.error({ error, userId, entityId, entityType }, 'Failed to detect meaning drift');
      return null;
    }
  }

  /**
   * Get current/active snapshot for an entity
   */
  async getCurrentSnapshot(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<EntityMeaningSnapshot | null> {
    const { data, error } = await supabaseAdmin
      .from('entity_meaning_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .is('timeframe_end', null)
      .order('timeframe_start', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      logger.error({ error }, 'Failed to get current snapshot');
      return null;
    }

    return data || null;
  }

  /**
   * Get mentions in a time window from journal entries
   */
  private async getMentionsInWindow(
    userId: string,
    entityId: string,
    entityType: EntityType,
    days: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ content: string; timestamp: string; sentiment?: number }>> {
    try {
      // Calculate date range
      const end = endDate || new Date();
      const start = startDate || new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

      // Get entity name/aliases from entity resolution service
      const entities = await entityResolutionService.listEntities(userId, {});
      const entity = entities.find(e => e.entity_id === entityId && e.entity_type === entityType);
      
      if (!entity) {
        return [];
      }

      // Build search terms (name + aliases)
      const searchTerms = [entity.primary_name, ...(entity.aliases || [])]
        .filter(Boolean)
        .map(term => term.toLowerCase());

      // Query journal entries in time window
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, date, metadata')
        .eq('user_id', userId)
        .gte('date', start.toISOString())
        .lte('date', end.toISOString())
        .order('date', { ascending: false })
        .limit(1000); // Reasonable limit

      if (error) {
        logger.error({ error }, 'Failed to query journal entries for mentions');
        return [];
      }

      if (!entries || entries.length === 0) {
        return [];
      }

      // Filter entries that mention the entity
      const mentions = entries
        .filter(entry => {
          const content = entry.content?.toLowerCase() || '';
          return searchTerms.some(term => content.includes(term));
        })
        .map(entry => {
          // Extract sentiment from metadata if available
          const sentiment = entry.metadata?.sentiment_score || 
                          entry.metadata?.sentiment || 
                          undefined;

          return {
            content: entry.content || '',
            timestamp: entry.date || entry.created_at || new Date().toISOString(),
            sentiment: sentiment ? parseFloat(sentiment) : undefined,
          };
        });

      return mentions;
    } catch (error) {
      logger.error({ error, userId, entityId, entityType }, 'Failed to get mentions in window');
      return [];
    }
  }

  /**
   * Analyze signals from recent vs historical mentions
   */
  private analyzeSignals(
    recentMentions: Array<{ content: string; timestamp: string; sentiment?: number }>,
    historicalMentions: Array<{ content: string; timestamp: string; sentiment?: number }>,
    currentSnapshot: EntityMeaningSnapshot | null
  ): {
    shifts: {
      context?: { from: DominantContext | null; to: DominantContext | null };
      sentiment?: { from: SentimentMode | null; to: SentimentMode | null };
      importance?: { from: ImportanceLevel | null; to: ImportanceLevel | null };
    };
    evidence: {
      context_mentions: Record<string, number>;
      sentiment_scores: { recent: number; historical: number };
      mention_frequency: { recent: number; historical: number };
      meta_overrides?: string[];
    };
  } {
    // Extract context keywords from mentions
    const recentContexts = this.extractContexts(recentMentions);
    const historicalContexts = this.extractContexts(historicalMentions);

    // Calculate sentiment scores
    const recentSentiment = this.calculateSentiment(recentMentions);
    const historicalSentiment = this.calculateSentiment(historicalMentions);

    // Calculate mention frequency (per month)
    const recentFrequency = (recentMentions.length / RECENT_WINDOW_DAYS) * 30;
    const historicalFrequency = (historicalMentions.length / HISTORICAL_WINDOW_DAYS) * 30;

    // Determine dominant contexts
    const recentDominant = this.getDominantContext(recentContexts);
    const historicalDominant = currentSnapshot?.dominant_context || this.getDominantContext(historicalContexts);

    // Detect shifts
    const shifts: any = {};
    
    if (recentDominant !== historicalDominant) {
      shifts.context = {
        from: historicalDominant,
        to: recentDominant,
      };
    }

    const recentSentimentMode = this.sentimentToMode(recentSentiment);
    const historicalSentimentMode = currentSnapshot?.sentiment_mode || this.sentimentToMode(historicalSentiment);
    
    if (recentSentimentMode !== historicalSentimentMode) {
      shifts.sentiment = {
        from: historicalSentimentMode,
        to: recentSentimentMode,
      };
    }

    // Importance shift (based on frequency change)
    if (Math.abs(recentFrequency - historicalFrequency) / Math.max(historicalFrequency, 1) > 0.5) {
      const recentImportance = this.frequencyToImportance(recentFrequency);
      const historicalImportance = currentSnapshot?.importance_level || this.frequencyToImportance(historicalFrequency);
      
      if (recentImportance !== historicalImportance) {
        shifts.importance = {
          from: historicalImportance,
          to: recentImportance,
        };
      }
    }

    return {
      shifts,
      evidence: {
        context_mentions: { ...recentContexts },
        sentiment_scores: {
          recent: recentSentiment,
          historical: historicalSentiment,
        },
        mention_frequency: {
          recent: recentFrequency,
          historical: historicalFrequency,
        },
      },
    };
  }

  /**
   * Extract context keywords from mentions
   */
  private extractContexts(
    mentions: Array<{ content: string }>
  ): Record<string, number> {
    const contexts: Record<string, number> = {};
    const contextKeywords: Record<DominantContext, string[]> = {
      Work: ['work', 'office', 'colleague', 'boss', 'meeting', 'project', 'job'],
      Family: ['family', 'mom', 'dad', 'sister', 'brother', 'parent', 'relative'],
      Romantic: ['date', 'partner', 'relationship', 'love', 'romantic', 'boyfriend', 'girlfriend'],
      Social: ['friend', 'party', 'social', 'hangout', 'group', 'together'],
      Personal: ['personal', 'myself', 'alone', 'private'],
      Professional: ['professional', 'career', 'business', 'client'],
      Academic: ['school', 'class', 'study', 'professor', 'student', 'university'],
      Health: ['doctor', 'health', 'medical', 'therapy', 'treatment'],
      Financial: ['money', 'finance', 'payment', 'salary', 'budget'],
      Creative: ['art', 'creative', 'project', 'design', 'write'],
      Other: [],
    };

    mentions.forEach(mention => {
      const content = mention.content.toLowerCase();
      Object.entries(contextKeywords).forEach(([context, keywords]) => {
        keywords.forEach(keyword => {
          if (content.includes(keyword)) {
            contexts[context] = (contexts[context] || 0) + 1;
          }
        });
      });
    });

    return contexts;
  }

  /**
   * Get dominant context from context mentions
   */
  private getDominantContext(contexts: Record<string, number>): DominantContext | null {
    const entries = Object.entries(contexts);
    if (entries.length === 0) return null;
    
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0][0] as DominantContext;
  }

  /**
   * Calculate average sentiment from mentions
   */
  private calculateSentiment(
    mentions: Array<{ sentiment?: number }>
  ): number {
    const sentiments = mentions
      .map(m => m.sentiment)
      .filter((s): s is number => s !== undefined);
    
    if (sentiments.length === 0) return 0;
    return sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  }

  /**
   * Convert sentiment score to mode
   */
  private sentimentToMode(sentiment: number): SentimentMode {
    if (sentiment > 0.3) return 'POSITIVE';
    if (sentiment < -0.3) return 'NEGATIVE';
    if (Math.abs(sentiment) < 0.1) return 'NEUTRAL';
    return 'MIXED';
  }

  /**
   * Convert frequency to importance level
   */
  private frequencyToImportance(frequency: number): ImportanceLevel {
    if (frequency >= 10) return 'High';
    if (frequency >= 3) return 'Moderate';
    if (frequency >= 1) return 'Low';
    return 'Background';
  }

  /**
   * Calculate overall signal strength
   */
  private calculateSignalStrength(signals: {
    shifts: any;
    evidence: any;
  }): number {
    let strength = 0;
    let factors = 0;

    // Context shift
    if (signals.shifts.context) {
      strength += 0.4;
      factors++;
    }

    // Sentiment shift
    if (signals.shifts.sentiment) {
      strength += 0.3;
      factors++;
    }

    // Importance shift
    if (signals.shifts.importance) {
      strength += 0.3;
      factors++;
    }

    // Multiple shifts = stronger signal
    if (factors > 1) {
      strength *= 1.2;
    }

    // Normalize
    return Math.min(1.0, strength);
  }

  /**
   * Create a new meaning snapshot
   */
  async createSnapshot(
    userId: string,
    entityId: string,
    entityType: EntityType,
    snapshot: Omit<EntityMeaningSnapshot, 'id' | 'user_id' | 'entity_id' | 'entity_type' | 'created_at' | 'updated_at'>
  ): Promise<EntityMeaningSnapshot> {
    const { data, error } = await supabaseAdmin
      .from('entity_meaning_snapshots')
      .insert({
        user_id: userId,
        entity_id: entityId,
        entity_type: entityType,
        ...snapshot,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create meaning snapshot');
      throw error;
    }

    return data;
  }

  /**
   * Create a transition record
   */
  async createTransition(
    userId: string,
    transition: Omit<EntityMeaningTransition, 'id' | 'user_id' | 'created_at'>
  ): Promise<EntityMeaningTransition> {
    const { data, error } = await supabaseAdmin
      .from('entity_meaning_transitions')
      .insert({
        user_id: userId,
        ...transition,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create meaning transition');
      throw error;
    }

    return data;
  }

  /**
   * Confirm a transition (user approved)
   */
  async confirmTransition(
    transitionId: string,
    userId: string,
    note?: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('entity_meaning_transitions')
      .update({
        user_confirmed: true,
        user_confirmed_at: new Date().toISOString(),
        note: note || null,
      })
      .eq('id', transitionId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error }, 'Failed to confirm transition');
      throw error;
    }
  }

  /**
   * Get meaning timeline for an entity
   */
  async getMeaningTimeline(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<{
    snapshots: EntityMeaningSnapshot[];
    transitions: EntityMeaningTransition[];
  }> {
    const [snapshotsResult, transitionsResult] = await Promise.all([
      supabaseAdmin
        .from('entity_meaning_snapshots')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)
        .order('timeframe_start', { ascending: true }),
      supabaseAdmin
        .from('entity_meaning_transitions')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)
        .order('detected_at', { ascending: true }),
    ]);

    if (snapshotsResult.error) {
      logger.error({ error: snapshotsResult.error }, 'Failed to get snapshots');
      throw snapshotsResult.error;
    }

    if (transitionsResult.error) {
      logger.error({ error: transitionsResult.error }, 'Failed to get transitions');
      throw transitionsResult.error;
    }

    return {
      snapshots: snapshotsResult.data || [],
      transitions: transitionsResult.data || [],
    };
  }
}

export const entityMeaningDriftService = new EntityMeaningDriftService();


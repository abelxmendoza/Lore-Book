import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  EmotionSignal,
  TriggerEvent,
  ReactionPattern,
  RegulationScore,
  EQInsight,
  EmotionType,
  TriggerType,
  ReactionType,
  EQStats,
} from './types';

/**
 * Handles storage and retrieval of emotional intelligence data
 */
export class EQStorage {
  /**
   * Save emotion signals
   */
  async saveEmotionSignals(signals: EmotionSignal[]): Promise<EmotionSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('emotion_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            emotion: s.emotion,
            intensity: s.intensity,
            evidence: s.evidence,
            weight: s.weight,
            entry_id: s.entry_id,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save emotion signals');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved emotion signals');
      return (data || []) as EmotionSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save emotion signals');
      return [];
    }
  }

  /**
   * Save trigger events
   */
  async saveTriggerEvents(triggers: TriggerEvent[]): Promise<TriggerEvent[]> {
    if (triggers.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('trigger_events')
        .insert(
          triggers.map(t => ({
            user_id: t.user_id,
            timestamp: t.timestamp,
            emotion_signal_id: t.emotion.id,
            trigger_type: t.triggerType,
            pattern: t.pattern,
            confidence: t.confidence,
            metadata: t.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save trigger events');
        return [];
      }

      return (data || []) as TriggerEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save trigger events');
      return [];
    }
  }

  /**
   * Save reaction patterns
   */
  async saveReactionPatterns(patterns: ReactionPattern[]): Promise<ReactionPattern[]> {
    if (patterns.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('reaction_patterns')
        .insert(
          patterns.map(p => ({
            user_id: p.user_id,
            timestamp: p.timestamp,
            type: p.type,
            evidence: p.evidence,
            confidence: p.confidence,
            emotion: p.emotion,
            metadata: p.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save reaction patterns');
        return [];
      }

      return (data || []) as ReactionPattern[];
    } catch (error) {
      logger.error({ error }, 'Failed to save reaction patterns');
      return [];
    }
  }

  /**
   * Save regulation score
   */
  async saveRegulationScore(userId: string, score: RegulationScore): Promise<RegulationScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('regulation_scores')
        .insert({
          user_id: userId,
          stability: score.stability,
          modulation: score.modulation,
          delay: score.delay,
          resilience: score.resilience,
          emotional_flexibility: score.emotionalFlexibility,
          overall: score.overall,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save regulation score');
        return null;
      }

      return {
        stability: data.stability,
        modulation: data.modulation,
        delay: data.delay,
        resilience: data.resilience,
        emotionalFlexibility: data.emotional_flexibility,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save regulation score');
      return null;
    }
  }

  /**
   * Save EQ insights
   */
  async saveInsights(insights: EQInsight[]): Promise<EQInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('eq_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            emotion: i.emotion,
            trigger_type: i.triggerType,
            timestamp: i.timestamp,
            confidence: i.confidence,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save EQ insights');
        return [];
      }

      return (data || []) as EQInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save EQ insights');
      return [];
    }
  }

  /**
   * Get emotion signals
   */
  async getEmotionSignals(userId: string, emotion?: EmotionType): Promise<EmotionSignal[]> {
    try {
      let query = supabaseAdmin
        .from('emotion_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (emotion) {
        query = query.eq('emotion', emotion);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get emotion signals');
        return [];
      }

      return (data || []) as EmotionSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to get emotion signals');
      return [];
    }
  }

  /**
   * Get trigger events
   */
  async getTriggerEvents(userId: string, triggerType?: TriggerType): Promise<TriggerEvent[]> {
    try {
      let query = supabaseAdmin
        .from('trigger_events')
        .select('*, emotion_signals(*)')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (triggerType) {
        query = query.eq('trigger_type', triggerType);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get trigger events');
        return [];
      }

      // Transform to match TriggerEvent interface
      return (data || []).map((t: any) => ({
        id: t.id,
        user_id: t.user_id,
        emotion: t.emotion_signals as EmotionSignal,
        triggerType: t.trigger_type as TriggerType,
        pattern: t.pattern,
        confidence: t.confidence,
        timestamp: t.timestamp,
        metadata: t.metadata,
      })) as TriggerEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get trigger events');
      return [];
    }
  }

  /**
   * Get reaction patterns
   */
  async getReactionPatterns(userId: string, type?: ReactionType): Promise<ReactionPattern[]> {
    try {
      let query = supabaseAdmin
        .from('reaction_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get reaction patterns');
        return [];
      }

      return (data || []) as ReactionPattern[];
    } catch (error) {
      logger.error({ error }, 'Failed to get reaction patterns');
      return [];
    }
  }

  /**
   * Get latest regulation score
   */
  async getLatestRegulationScore(userId: string): Promise<RegulationScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('regulation_scores')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        stability: data.stability,
        modulation: data.modulation,
        delay: data.delay,
        resilience: data.resilience,
        emotionalFlexibility: data.emotional_flexibility,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get regulation score');
      return null;
    }
  }

  /**
   * Get EQ insights
   */
  async getInsights(userId: string, type?: string, emotion?: EmotionType): Promise<EQInsight[]> {
    try {
      let query = supabaseAdmin
        .from('eq_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      if (emotion) {
        query = query.eq('emotion', emotion);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get EQ insights');
        return [];
      }

      return (data || []) as EQInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get EQ insights');
      return [];
    }
  }

  /**
   * Get EQ statistics
   */
  async getStats(userId: string): Promise<EQStats> {
    try {
      const { data: emotions, error: emotionError } = await supabaseAdmin
        .from('emotion_signals')
        .select('emotion, intensity')
        .eq('user_id', userId);

      const { data: triggers, error: triggerError } = await supabaseAdmin
        .from('trigger_events')
        .select('trigger_type')
        .eq('user_id', userId);

      const { data: regulation, error: regulationError } = await supabaseAdmin
        .from('regulation_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (emotionError || triggerError || regulationError) {
        return this.getEmptyStats();
      }

      // Calculate emotion distribution
      const emotionsByType: Record<string, number> = {};
      (emotions || []).forEach(e => {
        emotionsByType[e.emotion] = (emotionsByType[e.emotion] || 0) + 1;
      });

      // Calculate trigger distribution
      const triggersByType: Record<string, number> = {};
      (triggers || []).forEach(t => {
        triggersByType[t.trigger_type] = (triggersByType[t.trigger_type] || 0) + 1;
      });

      // Calculate average intensity
      const totalIntensity = (emotions || []).reduce((sum, e) => sum + (e.intensity || 0), 0);
      const avgIntensity = (emotions || []).length > 0 ? totalIntensity / emotions.length : 0;

      // Top emotions
      const topEmotions = Object.entries(emotionsByType)
        .map(([emotion, count]) => ({ emotion: emotion as EmotionType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top triggers
      const topTriggers = Object.entries(triggersByType)
        .map(([trigger, count]) => ({ trigger: trigger as TriggerType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total_emotions: emotions?.length || 0,
        emotions_by_type: emotionsByType as Record<EmotionType, number>,
        total_triggers: triggers?.length || 0,
        triggers_by_type: triggersByType as Record<TriggerType, number>,
        average_intensity: avgIntensity,
        regulation_score: regulation?.overall || 0,
        top_emotions: topEmotions,
        top_triggers: topTriggers,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get EQ stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): EQStats {
    return {
      total_emotions: 0,
      emotions_by_type: {} as Record<EmotionType, number>,
      total_triggers: 0,
      triggers_by_type: {} as Record<TriggerType, number>,
      average_intensity: 0,
      regulation_score: 0,
      top_emotions: [],
      top_triggers: [],
    };
  }
}


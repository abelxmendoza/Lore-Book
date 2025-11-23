import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  SymptomEvent,
  SleepEvent,
  EnergyEvent,
  WellnessScore,
  HealthInsight,
  SymptomType,
  HealthStats,
} from './types';

/**
 * Handles storage and retrieval of health and wellness data
 */
export class HealthStorage {
  /**
   * Save symptom events
   */
  async saveSymptomEvents(events: SymptomEvent[]): Promise<SymptomEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('symptom_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            type: e.type,
            intensity: e.intensity,
            evidence: e.evidence,
            weight: e.weight,
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save symptom events');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved symptom events');
      return (data || []) as SymptomEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save symptom events');
      return [];
    }
  }

  /**
   * Save sleep events
   */
  async saveSleepEvents(events: SleepEvent[]): Promise<SleepEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('sleep_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            hours: e.hours,
            quality: e.quality,
            evidence: e.evidence,
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save sleep events');
        return [];
      }

      return (data || []) as SleepEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save sleep events');
      return [];
    }
  }

  /**
   * Save energy events
   */
  async saveEnergyEvents(events: EnergyEvent[]): Promise<EnergyEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('energy_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            level: e.level,
            evidence: e.evidence,
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save energy events');
        return [];
      }

      return (data || []) as EnergyEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save energy events');
      return [];
    }
  }

  /**
   * Save wellness score
   */
  async saveWellnessScore(userId: string, score: WellnessScore): Promise<WellnessScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('wellness_scores')
        .insert({
          user_id: userId,
          physical: score.physical,
          mental: score.mental,
          sleep: score.sleep,
          recovery: score.recovery,
          overall: score.overall,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save wellness score');
        return null;
      }

      return {
        physical: data.physical,
        mental: data.mental,
        sleep: data.sleep,
        recovery: data.recovery,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save wellness score');
      return null;
    }
  }

  /**
   * Save health insights
   */
  async saveInsights(insights: HealthInsight[]): Promise<HealthInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('health_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            timestamp: i.timestamp,
            confidence: i.confidence,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save health insights');
        return [];
      }

      return (data || []) as HealthInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save health insights');
      return [];
    }
  }

  /**
   * Get symptom events
   */
  async getSymptomEvents(userId: string, type?: SymptomType): Promise<SymptomEvent[]> {
    try {
      let query = supabaseAdmin
        .from('symptom_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get symptom events');
        return [];
      }

      return (data || []) as SymptomEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get symptom events');
      return [];
    }
  }

  /**
   * Get sleep events
   */
  async getSleepEvents(userId: string): Promise<SleepEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('sleep_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get sleep events');
        return [];
      }

      return (data || []) as SleepEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get sleep events');
      return [];
    }
  }

  /**
   * Get energy events
   */
  async getEnergyEvents(userId: string): Promise<EnergyEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('energy_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get energy events');
        return [];
      }

      return (data || []) as EnergyEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get energy events');
      return [];
    }
  }

  /**
   * Get latest wellness score
   */
  async getLatestWellnessScore(userId: string): Promise<WellnessScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('wellness_scores')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        physical: data.physical,
        mental: data.mental,
        sleep: data.sleep,
        recovery: data.recovery,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get wellness score');
      return null;
    }
  }

  /**
   * Get health insights
   */
  async getInsights(userId: string, type?: string): Promise<HealthInsight[]> {
    try {
      let query = supabaseAdmin
        .from('health_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get health insights');
        return [];
      }

      return (data || []) as HealthInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get health insights');
      return [];
    }
  }

  /**
   * Get health statistics
   */
  async getStats(userId: string): Promise<HealthStats> {
    try {
      const { data: symptoms, error: symptomError } = await supabaseAdmin
        .from('symptom_events')
        .select('type, intensity')
        .eq('user_id', userId);

      const { data: sleep, error: sleepError } = await supabaseAdmin
        .from('sleep_events')
        .select('hours, quality')
        .eq('user_id', userId);

      const { data: energy, error: energyError } = await supabaseAdmin
        .from('energy_events')
        .select('level')
        .eq('user_id', userId);

      const { data: wellness, error: wellnessError } = await supabaseAdmin
        .from('wellness_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (symptomError || sleepError || energyError || wellnessError) {
        return this.getEmptyStats();
      }

      // Calculate symptom distribution
      const symptomsByType: Record<string, number> = {};
      (symptoms || []).forEach(s => {
        symptomsByType[s.type] = (symptomsByType[s.type] || 0) + 1;
      });

      // Calculate average sleep
      const sleepHours = (sleep || []).filter(s => s.hours !== null).map(s => s.hours);
      const avgSleepHours = sleepHours.length > 0
        ? sleepHours.reduce((sum, h) => sum + (h || 0), 0) / sleepHours.length
        : 0;

      const sleepQualities = (sleep || []).filter(s => s.quality !== null).map(s => s.quality);
      const avgSleepQuality = sleepQualities.length > 0
        ? sleepQualities.reduce((sum, q) => sum + (q || 0), 0) / sleepQualities.length
        : 0;

      // Calculate average energy
      const totalEnergy = (energy || []).reduce((sum, e) => sum + (e.level || 0), 0);
      const avgEnergy = (energy || []).length > 0 ? totalEnergy / energy.length : 0;

      // Top symptoms
      const topSymptoms = Object.entries(symptomsByType)
        .map(([type, count]) => ({ type: type as SymptomType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total_symptoms: symptoms?.length || 0,
        symptoms_by_type: symptomsByType as Record<SymptomType, number>,
        average_sleep_hours: avgSleepHours,
        average_sleep_quality: avgSleepQuality,
        average_energy: avgEnergy,
        wellness_score: wellness?.overall || 0,
        top_symptoms: topSymptoms,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get health stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): HealthStats {
    return {
      total_symptoms: 0,
      symptoms_by_type: {} as Record<SymptomType, number>,
      average_sleep_hours: 0,
      average_sleep_quality: 0,
      average_energy: 0,
      wellness_score: 0,
      top_symptoms: [],
    };
  }
}


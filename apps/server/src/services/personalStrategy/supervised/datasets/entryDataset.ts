import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { PatternType } from '../types';

export interface EntryExample {
  entry_id: string;
  text: string;
  features: number[];
  pattern: PatternType | null;
  state_features: Record<string, number>;
  timestamp: string;
}

/**
 * Dataset for pattern classification
 * Loads journal entries with labels (from user corrections or inferred)
 */
export class EntryDataset {
  /**
   * Load training examples for pattern classification
   */
  async loadTrainingExamples(
    userId: string,
    limit: number = 1000
  ): Promise<EntryExample[]> {
    try {
      // Get entries with pattern labels (from corrections or manual labels)
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .not('pattern_type', 'is', null)
        .order('date', { ascending: false })
        .limit(limit);

      if (!entries || entries.length === 0) {
        logger.debug({ userId }, 'No labeled entries found, will infer patterns');
        return this.loadInferredExamples(userId, limit);
      }

      const examples: EntryExample[] = [];

      for (const entry of entries) {
        const features = await this.extractFeatures(entry, userId);
        const pattern = entry.pattern_type as PatternType || null;

        if (pattern) {
          examples.push({
            entry_id: entry.id,
            text: entry.content || entry.text || '',
            features,
            pattern,
            state_features: await this.extractStateFeatures(entry, userId),
            timestamp: entry.date || entry.created_at,
          });
        }
      }

      logger.info({ userId, examples: examples.length }, 'Loaded entry training examples');
      return examples;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load entry training examples');
      return [];
    }
  }

  /**
   * Load examples by inferring patterns from outcomes
   */
  private async loadInferredExamples(
    userId: string,
    limit: number
  ): Promise<EntryExample[]> {
    try {
      // Get entries with linked actions that have outcomes
      const { data: actions } = await supabaseAdmin
        .from('strategy_actions')
        .select('entry_id, outcome, reward, timestamp')
        .eq('user_id', userId)
        .not('outcome', 'is', null)
        .not('entry_id', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!actions || actions.length === 0) {
        return [];
      }

      const entryIds = [...new Set(actions.map(a => a.entry_id).filter(Boolean))];
      
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .in('id', entryIds);

      if (!entries) return [];

      const examples: EntryExample[] = [];

      for (const entry of entries) {
        const entryActions = actions.filter(a => a.entry_id === entry.id);
        const pattern = this.inferPatternFromOutcomes(entryActions);

        if (pattern) {
          const features = await this.extractFeatures(entry, userId);
          examples.push({
            entry_id: entry.id,
            text: entry.content || entry.text || '',
            features,
            pattern,
            state_features: await this.extractStateFeatures(entry, userId),
            timestamp: entry.date || entry.created_at,
          });
        }
      }

      logger.info({ userId, examples: examples.length }, 'Loaded inferred entry examples');
      return examples;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load inferred examples');
      return [];
    }
  }

  /**
   * Extract features from entry text and metadata
   */
  private async extractFeatures(entry: any, userId: string): Promise<number[]> {
    const text = (entry.content || entry.text || '').toLowerCase();
    const features: number[] = [];

    // 1. Text length features
    features.push(Math.min(text.length / 1000, 1.0)); // Normalized length
    features.push((text.match(/\./g) || []).length / 10); // Sentence count
    features.push((text.match(/!/g) || []).length / 5); // Exclamation count

    // 2. Sentiment indicators
    const positiveWords = ['good', 'great', 'happy', 'excited', 'proud', 'grateful', 'love', 'amazing'];
    const negativeWords = ['bad', 'sad', 'angry', 'frustrated', 'worried', 'anxious', 'hate', 'terrible'];
    const growthWords = ['learned', 'improved', 'progress', 'better', 'growing', 'developing'];
    const avoidanceWords = ['avoid', 'procrastinate', 'delay', 'skip', 'ignore', 'postpone'];

    features.push(positiveWords.filter(w => text.includes(w)).length / positiveWords.length);
    features.push(negativeWords.filter(w => text.includes(w)).length / negativeWords.length);
    features.push(growthWords.filter(w => text.includes(w)).length / growthWords.length);
    features.push(avoidanceWords.filter(w => text.includes(w)).length / avoidanceWords.length);

    // 3. Action mentions
    const actionMentions = ['trained', 'coded', 'worked', 'rested', 'socialized', 'learned', 'created'];
    features.push(actionMentions.filter(a => text.includes(a)).length / actionMentions.length);

    // 4. Time features
    const entryDate = new Date(entry.date || entry.created_at);
    features.push(entryDate.getHours() / 24); // Hour of day
    features.push(entryDate.getDay() / 7); // Day of week

    // 5. Metadata features
    features.push(entry.metadata?.emotion_score || 0);
    features.push(entry.metadata?.energy_level || 0.5);
    features.push(entry.metadata?.stress_level || 0.5);

    return features;
  }

  /**
   * Extract state features at time of entry
   */
  private async extractStateFeatures(entry: any, userId: string): Promise<Record<string, number>> {
    // Get state snapshot closest to entry time
    const entryTime = new Date(entry.date || entry.created_at);
    
    const { data: snapshot } = await supabaseAdmin
      .from('state_snapshots')
      .select('snapshot_data')
      .eq('user_id', userId)
      .lte('timestamp', entryTime.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (snapshot?.snapshot_data) {
      return snapshot.snapshot_data;
    }

    // Default state
    return {
      mood: 0,
      energy: 0.5,
      stress: 0.5,
      consistency_score: 0.5,
      identity_alignment: 0.5,
      goal_progress_score: 0,
    };
  }

  /**
   * Infer pattern from action outcomes
   */
  private inferPatternFromOutcomes(actions: any[]): PatternType | null {
    if (actions.length === 0) return null;

    const positiveCount = actions.filter(a => a.outcome === 'positive').length;
    const negativeCount = actions.filter(a => a.outcome === 'negative').length;
    const avgReward = actions.reduce((sum, a) => sum + (a.reward || 0), 0) / actions.length;

    // Growth: mostly positive outcomes, high rewards
    if (positiveCount / actions.length > 0.7 && avgReward > 0.5) {
      return 'growth';
    }

    // Recovery: improving trend (negative -> positive)
    const sorted = actions.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const earlyNegative = sorted.slice(0, Math.floor(sorted.length / 2))
      .filter(a => a.outcome === 'negative').length;
    const latePositive = sorted.slice(Math.floor(sorted.length / 2))
      .filter(a => a.outcome === 'positive').length;
    
    if (earlyNegative > 0 && latePositive > earlyNegative) {
      return 'recovery';
    }

    // Avoidance spiral: mostly negative, low rewards
    if (negativeCount / actions.length > 0.6 && avgReward < -0.3) {
      return 'avoidance_spiral';
    }

    // Burnout risk: high stress + negative outcomes
    // (Would need state data for this, simplified here)
    if (negativeCount / actions.length > 0.5 && avgReward < 0) {
      return 'burnout_risk';
    }

    // Stagnation: neutral outcomes
    if (actions.filter(a => a.outcome === 'neutral').length / actions.length > 0.6) {
      return 'stagnation';
    }

    // Default: maintenance
    return 'maintenance';
  }

  /**
   * Save pattern label for entry (for future training)
   */
  async savePatternLabel(
    userId: string,
    entryId: string,
    pattern: PatternType
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('journal_entries')
        .update({ pattern_type: pattern })
        .eq('id', entryId)
        .eq('user_id', userId);
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to save pattern label');
    }
  }
}

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { TraitExtractor } from './traitExtractor';
import type { PersonalityOutput, PersonalityProfile, PersonalityInsight } from './types';

/**
 * Personality Engine V1
 * Simple extraction and tracking of personality traits from journal entries
 */
export class PersonalityEngine {
  private extractor: TraitExtractor;

  constructor() {
    this.extractor = new TraitExtractor();
  }

  /**
   * Process personality for a user
   */
  async process(userId: string): Promise<PersonalityOutput> {
    try {
      logger.debug({ userId }, 'Processing personality');

      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000);

      // Extract traits
      const traits = this.extractor.extract(entries || []);
      traits.forEach(t => { t.user_id = userId; });

      // Get dominant traits (top 5 by frequency)
      const dominantTraits = traits
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
        .map(t => t.trait);

      const profile: PersonalityProfile = {
        user_id: userId,
        traits,
        dominant_traits: dominantTraits,
      };

      // Generate insights
      const insights: PersonalityInsight[] = [];

      if (traits.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'trait_detected',
          message: `${traits.length} personality traits detected. Your dominant traits: ${dominantTraits.join(', ')}.`,
          confidence: 0.9,
          timestamp: new Date().toISOString(),
          user_id: userId,
          metadata: {
            total_traits: traits.length,
            dominant_traits: dominantTraits,
          },
        });

        // Trait evolution (if we have historical data)
        const highFrequencyTraits = traits.filter(t => t.frequency >= 3);
        if (highFrequencyTraits.length > 0) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'dominant_trait',
            message: `Strong personality traits: ${highFrequencyTraits.map(t => t.trait).join(', ')}. These appear frequently in your journal entries.`,
            confidence: 0.85,
            timestamp: new Date().toISOString(),
            user_id: userId,
            metadata: {
              high_frequency_traits: highFrequencyTraits.map(t => ({
                trait: t.trait,
                frequency: t.frequency,
              })),
            },
          });
        }
      }

      logger.info(
        {
          userId,
          traits: traits.length,
          dominant_traits: dominantTraits.length,
          insights: insights.length,
        },
        'Processed personality'
      );

      return {
        profile,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process personality');
      return {
        profile: {
          user_id: userId,
          traits: [],
          dominant_traits: [],
        },
        insights: [],
      };
    }
  }
}


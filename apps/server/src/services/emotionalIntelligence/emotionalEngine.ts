import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { extractEmotionalSignals } from './extractSignals';
import { detectTriggers } from './detectTriggers';
import { mapBehaviorResponse } from './mapResponses';
import { detectRegulation } from './regulation';
import { storeEmotionalEvent, getAllEvents } from './storeEvent';
import { analyzePatterns } from './patterns';
import type { EmotionalEvent, EmotionalPatternSummary } from './types';

/**
 * Main Emotional Intelligence Engine
 * Analyzes emotional processing, triggers, behaviors, and patterns
 */
export async function emotionalIntelligenceEngine(
  journalEntry: { id: string; text: string; content?: string },
  userId: string
): Promise<EmotionalPatternSummary> {
  try {
    logger.debug({ userId, entryId: journalEntry.id }, 'Processing emotional intelligence');

    const text = journalEntry.text || journalEntry.content || '';

    if (!text) {
      logger.debug({ userId }, 'No text in entry');
      return {
        dominantEmotions: [],
        recurringTriggers: [],
        reactionLoops: {},
        recoverySpeed: 0,
        volatilityScore: 0,
        emotionalBiases: {},
      };
    }

    // Step 1: Extract emotional signals
    const events = extractEmotionalSignals(text);

    if (events.length === 0) {
      logger.debug({ userId }, 'No emotional signals found');
      // Still analyze existing patterns
      const allEvents = await getAllEvents(userId);
      const summary = analyzePatterns(allEvents);
      await upsertPatterns(userId, summary);
      return summary;
    }

    // Step 2: Enrich events with triggers, behaviors, and regulation
    const triggers = detectTriggers(text);
    const behaviorResponse = mapBehaviorResponse(text);
    const regulationStrategy = detectRegulation(text);

    const enrichedEvents: EmotionalEvent[] = events.map((e) => ({
      ...e,
      trigger: triggers.length > 0 ? triggers[0] : undefined, // Use first trigger
      behaviorResponse: behaviorResponse || undefined,
      regulationStrategy: regulationStrategy || undefined,
    }));

    // Step 3: Store events
    for (const event of enrichedEvents) {
      await storeEmotionalEvent(event, journalEntry.id, userId);
    }

    // Step 4: Recalculate patterns
    const allEvents = await getAllEvents(userId);
    const summary = analyzePatterns(allEvents);

    // Step 5: Upsert patterns
    await upsertPatterns(userId, summary);

    logger.info(
      {
        userId,
        events: enrichedEvents.length,
        dominantEmotions: summary.dominantEmotions.length,
      },
      'Processed emotional intelligence'
    );

    return summary;
  } catch (error) {
    logger.error({ error, userId }, 'Error processing emotional intelligence');
    throw error;
  }
}

/**
 * Upsert emotional patterns
 */
async function upsertPatterns(userId: string, summary: EmotionalPatternSummary): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('emotional_patterns')
      .upsert(
        {
          user_id: userId,
          dominant_emotions: summary.dominantEmotions,
          recurring_triggers: summary.recurringTriggers,
          reaction_loops: summary.reactionLoops,
          recovery_speed: summary.recoverySpeed,
          volatility_score: summary.volatilityScore,
          emotional_biases: summary.emotionalBiases,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      logger.error({ error }, 'Error upserting emotional patterns');
      throw error;
    }
  } catch (error) {
    logger.error({ error }, 'Error upserting patterns');
    throw error;
  }
}


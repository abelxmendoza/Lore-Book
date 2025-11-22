import { logger } from '../logger';
import { LearningEngine } from '../services/learning/learningEngine';
import { supabaseAdmin } from '../services/supabaseClient';

const learningEngine = new LearningEngine();

/**
 * Extract learning from a journal entry
 */
export const extractLearningFromEntry = async (
  userId: string,
  entryId: string
): Promise<void> => {
  try {
    logger.debug({ userId, entryId }, 'Extracting learning from entry');

    // Get entry
    const { data: entry, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (error || !entry) {
      logger.warn({ error, userId, entryId }, 'Entry not found for learning extraction');
      return;
    }

    if (!entry.content || entry.content.length < 50) {
      logger.debug({ userId, entryId }, 'Entry too short for learning extraction');
      return;
    }

    // Extract learning
    await learningEngine.extractFromEntry(
      userId,
      entry.id,
      entry.content,
      entry.date
    );

    logger.info({ userId, entryId }, 'Successfully extracted learning from entry');
  } catch (error) {
    logger.error({ error, userId, entryId }, 'Failed to extract learning from entry');
  }
};


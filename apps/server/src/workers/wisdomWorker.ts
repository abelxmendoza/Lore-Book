import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { WisdomEngine } from '../services/wisdom/wisdomEngine';

const wisdomEngine = new WisdomEngine();

/**
 * Extract wisdom from a journal entry
 */
export const extractWisdomFromEntry = async (
  userId: string,
  entryId: string
): Promise<void> => {
  try {
    logger.debug({ userId, entryId }, 'Extracting wisdom from entry');

    // Get entry
    const { data: entry, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (error || !entry) {
      logger.warn({ error, userId, entryId }, 'Entry not found for wisdom extraction');
      return;
    }

    if (!entry.content || entry.content.length < 50) {
      logger.debug({ userId, entryId }, 'Entry too short for wisdom extraction');
      return;
    }

    // Extract wisdom
    await wisdomEngine.extractFromEntry(
      userId,
      entry.id,
      entry.content,
      entry.date
    );

    logger.info({ userId, entryId }, 'Successfully extracted wisdom from entry');
  } catch (error) {
    logger.error({ error, userId, entryId }, 'Failed to extract wisdom from entry');
  }
};


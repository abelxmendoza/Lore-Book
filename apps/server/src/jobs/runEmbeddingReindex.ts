/**
 * Embedding Reindex Job
 * Re-processes all journal entries to generate embeddings
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { embeddingService } from '../services/embeddingService';
import { logger } from '../logger';

export async function runEmbeddingReindex(): Promise<{ processed: number; errors: number }> {
  logger.info('Starting embedding reindex job');
  
  let processed = 0;
  let errors = 0;

  try {
    // Fetch all journal entries without embeddings or with outdated embeddings
    const { data: entries, error: fetchError } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content')
      .limit(1000); // Process in batches

    if (fetchError) {
      logger.error({ error: fetchError }, 'Failed to fetch entries for reindexing');
      throw fetchError;
    }

    if (!entries || entries.length === 0) {
      logger.info('No entries to reindex');
      return { processed: 0, errors: 0 };
    }

    logger.info({ count: entries.length }, 'Processing entries for reindexing');

    // Process each entry
    for (const entry of entries) {
      try {
        // Generate embedding
        const embedding = await embeddingService.generateEmbedding(entry.content);

        // Update entry with new embedding
        const { error: updateError } = await supabaseAdmin
          .from('journal_entries')
          .update({ 
            embedding,
            updated_at: new Date().toISOString()
          })
          .eq('id', entry.id);

        if (updateError) {
          logger.error({ error: updateError, entryId: entry.id }, 'Failed to update entry embedding');
          errors++;
        } else {
          processed++;
        }
      } catch (error) {
        logger.error({ error, entryId: entry.id }, 'Error processing entry for reindexing');
        errors++;
      }
    }

    logger.info({ processed, errors }, 'Embedding reindex job completed');
    return { processed, errors };
  } catch (error) {
    logger.error({ error }, 'Embedding reindex job failed');
    throw error;
  }
}


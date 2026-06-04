/**
 * PIPELINE VALIDATION SCRIPT
 *
 * Triggers extraction for the most populated session and verifies
 * that journal_entries > 0 afterward.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/validatePipeline.ts
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { memoryExtractionService } from '../services/memoryExtractionService';
import { NotMemoryWorthyError } from '../services/memoryExtractionService';
import { logger } from '../logger';

async function validate(): Promise<void> {
  logger.info('=== PIPELINE VALIDATION START ===');

  // 1. Find the session with the most metadata.messages
  const { data: sessions } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, user_id, metadata')
    .eq('metadata->>extractionStatus', 'pending')
    .order('created_at', { ascending: true });

  if (!sessions || sessions.length === 0) {
    logger.error('No pending sessions found — run backfill first');
    process.exit(1);
  }

  // Pick the session with the most messages in metadata
  const sessionWithMessages = sessions
    .map(s => ({
      ...s,
      msgCount: Array.isArray((s.metadata as any)?.messages)
        ? (s.metadata as any).messages.length
        : 0,
    }))
    .sort((a, b) => b.msgCount - a.msgCount)[0];

  logger.info({
    sessionId: sessionWithMessages.id,
    userId: sessionWithMessages.user_id,
    messageCount: sessionWithMessages.msgCount,
  }, 'Selected session for extraction test');

  // 2. Count journal_entries before
  const { count: beforeCount } = await supabaseAdmin
    .from('journal_entries')
    .select('id', { count: 'exact', head: true });

  logger.info({ before: beforeCount ?? 0 }, 'journal_entries BEFORE extraction');

  // 3. Run extraction
  try {
    const result = await memoryExtractionService.extractMemory({
      sessionId: sessionWithMessages.id,
      userId: sessionWithMessages.user_id,
      immediate: true,
    });

    logger.info({
      journalEntryId: result.journalEntry.id,
      components: result.components.length,
      confidence: result.extractionConfidence,
    }, 'Extraction succeeded');

    // 4. Count journal_entries after
    const { count: afterCount } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true });

    logger.info({ after: afterCount ?? 0 }, 'journal_entries AFTER extraction');

    if ((afterCount ?? 0) > (beforeCount ?? 0)) {
      logger.info('✅ PIPELINE VALIDATED — journal_entries increased');
    } else {
      logger.error('❌ journal_entries did not increase — check extraction logic');
      process.exit(1);
    }

  } catch (err) {
    if (err instanceof NotMemoryWorthyError) {
      logger.warn({ reason: err.message }, 'Session not memory-worthy — try a different session');
    } else {
      logger.error({ err }, 'Extraction failed with real error');
      process.exit(1);
    }
  }

  logger.info('=== PIPELINE VALIDATION END ===');
}

validate().catch(err => {
  logger.error({ err }, 'Validation script crashed');
  process.exit(1);
});

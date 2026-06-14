/**
 * Backfill entity ↔ conversation links from provenance, message search, and orphan recovery.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/backfillEntityConversationLinks.ts
 *   cd apps/server && npx tsx src/scripts/backfillEntityConversationLinks.ts --name "Ashley De la Cruz"
 *   cd apps/server && npx tsx src/scripts/backfillEntityConversationLinks.ts --user-id <uuid>
 */

import 'dotenv/config';
import { supabaseAdmin } from '../services/supabaseClient';
import { backfillEntityConversationLinksForUser } from '../services/conversationCentered/entityConversationBackfillService';
import { logger } from '../logger';

function parseArgs() {
  const args = process.argv.slice(2);
  let userId: string | undefined;
  let characterName: string | undefined;
  let characterId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id' && args[i + 1]) userId = args[++i];
    else if (args[i] === '--name' && args[i + 1]) characterName = args[++i];
    else if (args[i] === '--character-id' && args[i + 1]) characterId = args[++i];
  }

  return { userId, characterName, characterId };
}

async function main() {
  const { userId: argUserId, characterName, characterId } = parseArgs();

  let userIds: string[] = [];

  if (argUserId) {
    userIds = [argUserId];
  } else {
    const { data, error } = await supabaseAdmin.from('characters').select('user_id');
    if (error) {
      logger.error({ error }, 'Failed to list users');
      process.exit(1);
    }
    userIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
  }

  logger.info({ userCount: userIds.length, characterName, characterId }, 'Starting entity conversation backfill');

  let totalLinks = 0;
  let totalRecovered = 0;

  for (const userId of userIds) {
    const result = await backfillEntityConversationLinksForUser(userId, {
      characterId,
      characterName,
    });
    totalLinks += result.linksCreated;
    totalRecovered += result.recoveredSessions;

    logger.info({ userId, ...result }, 'User backfill complete');
    if (result.errors.length) {
      logger.warn({ errors: result.errors }, 'Backfill completed with errors');
    }
  }

  logger.info({ totalLinks, totalRecovered }, 'Entity conversation backfill finished');
}

main().catch((err) => {
  logger.error({ err }, 'Backfill script failed');
  process.exit(1);
});

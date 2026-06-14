/**
 * Backfill DiceBear avatars for characters missing avatar_url.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/backfillCharacterAvatars.ts
 *   cd apps/server && npx tsx src/scripts/backfillCharacterAvatars.ts --user-id <uuid>
 */

import 'dotenv/config';
import { logger } from '../logger';
import { backfillMissingAvatars } from '../services/characterAvatarService';
import { supabaseAdmin } from '../services/supabaseClient';

async function main() {
  const userIdx = process.argv.indexOf('--user-id');
  const userFilter = userIdx >= 0 ? process.argv[userIdx + 1] : null;

  let query = supabaseAdmin
    .from('characters')
    .select('id, user_id, name, avatar_url, archetype, role')
    .is('avatar_url', null);

  if (userFilter) query = query.eq('user_id', userFilter);

  const { data: characters, error } = await query.limit(500);
  if (error) throw error;

  if (!characters?.length) {
    console.log('All characters already have avatars.');
    return;
  }

  const byUser = new Map<string, typeof characters>();
  for (const row of characters) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let total = 0;
  for (const [userId, rows] of byUser) {
    const updated = await backfillMissingAvatars(userId, rows, rows.length);
    total += updated;
    logger.info({ userId, updated }, 'Avatar backfill batch complete');
  }

  console.log(`Backfilled avatars for ${total} character(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

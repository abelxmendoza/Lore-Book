import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Returns distinct user IDs that have journal entries in the last 30 days.
 * This is the canonical definition of "active user" for background workers.
 */
export async function getActiveUserIds(): Promise<string[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('user_id')
    .gte('date', cutoff.toISOString());

  if (error) {
    logger.error({ error }, 'workerUtils: failed to fetch active user IDs');
    return [];
  }

  return [...new Set(((data ?? []) as Array<{ user_id: string }>).map(r => r.user_id))];
}

/**
 * Run a per-user worker function for all active users with bounded concurrency.
 * Errors from individual users are logged but do not abort the batch.
 */
export async function runForAllActiveUsers(
  label: string,
  fn: (userId: string) => Promise<void>,
  concurrency = 5
): Promise<void> {
  const userIds = await getActiveUserIds();

  if (userIds.length === 0) {
    logger.info({ label }, 'No active users — skipping worker run');
    return;
  }

  logger.info({ label, userCount: userIds.length }, 'Starting worker for all active users');

  for (let i = 0; i < userIds.length; i += concurrency) {
    const batch = userIds.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(userId =>
        fn(userId).catch(err =>
          logger.error({ err, userId, label }, 'Worker failed for user')
        )
      )
    );
  }

  logger.info({ label, userCount: userIds.length }, 'Worker completed for all active users');
}

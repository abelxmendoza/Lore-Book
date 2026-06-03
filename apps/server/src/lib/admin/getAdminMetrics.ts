/**
 * Admin Metrics Helper
 *
 * Returns best-effort metrics for the admin dashboard.
 * Each query is wrapped independently — a failing query returns 0
 * rather than crashing the entire response.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../../services/supabaseClient';

export interface AdminMetrics {
  totalUsers: number;
  totalMemories: number;
  newUsersLast7Days: number;
  aiGenerationsToday: number;
  errorLogsLast24h: number;
}

const DEFAULTS: AdminMetrics = {
  totalUsers: 0,
  totalMemories: 0,
  newUsersLast7Days: 0,
  aiGenerationsToday: 0,
  errorLogsLast24h: 0,
};

export async function getAdminMetrics(): Promise<AdminMetrics> {
  // Run all queries in parallel; failures return null, never throw.
  const [usersResult, memoryResult] = await Promise.allSettled([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from('journal_entries').select('*', { count: 'exact', head: true }),
  ]);

  // ── Users ────────────────────────────────────────────────────────────────
  let totalUsers        = 0;
  let newUsersLast7Days = 0;

  if (usersResult.status === 'fulfilled' && !usersResult.value.error) {
    const users = usersResult.value.data?.users ?? [];
    totalUsers = users.length;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    newUsersLast7Days = users.filter(u => new Date(u.created_at || 0) >= sevenDaysAgo).length;
  } else {
    logger.warn({ error: usersResult.status === 'rejected' ? usersResult.reason : usersResult.value.error },
      'Admin metrics: user query failed — returning 0');
  }

  // ── Memories ─────────────────────────────────────────────────────────────
  let totalMemories = 0;

  if (memoryResult.status === 'fulfilled' && !memoryResult.value.error) {
    totalMemories = memoryResult.value.count ?? 0;
  } else {
    logger.warn({ error: memoryResult.status === 'rejected' ? memoryResult.reason : memoryResult.value.error },
      'Admin metrics: memory count query failed — returning 0');
  }

  return {
    totalUsers,
    totalMemories,
    newUsersLast7Days,
    aiGenerationsToday: 0,   // TODO: track via AI event log
    errorLogsLast24h:   0,   // TODO: track via logging service
  };
}

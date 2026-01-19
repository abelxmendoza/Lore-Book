/**
 * Admin Metrics Helper
 * Fetches metrics for admin dashboard
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

export async function getAdminMetrics(): Promise<AdminMetrics> {
  try {
    // Get total users
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (usersError) {
      logger.error({ error: usersError }, 'Failed to fetch users for metrics');
    }

    const totalUsers = usersData?.users?.length || 0;

    // Get total memories (journal entries)
    const { count: memoryCount, error: memoryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true });

    if (memoryError) {
      logger.error({ error: memoryError }, 'Failed to fetch memories for metrics');
    }

    const totalMemories = memoryCount || 0;

    // Get new users in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const newUsersLast7Days = usersData?.users?.filter(user => {
      const createdAt = new Date(user.created_at || 0);
      return createdAt >= sevenDaysAgo;
    }).length || 0;

    // Get AI generations today (placeholder - would need to track this)
    // TODO: Implement AI event tracking table
    const aiGenerationsToday = 0;

    // Get error logs in last 24h (placeholder - would need logging service)
    // TODO: Implement log querying from logging service
    const errorLogsLast24h = 0;

    return {
      totalUsers,
      totalMemories,
      newUsersLast7Days,
      aiGenerationsToday,
      errorLogsLast24h
    };
  } catch (error) {
    logger.error({ error }, 'Error fetching admin metrics');
    throw error;
  }
}


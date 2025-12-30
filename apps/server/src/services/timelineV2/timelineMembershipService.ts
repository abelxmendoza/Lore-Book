import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface TimelineMembership {
  id: string;
  user_id: string;
  journal_entry_id: string;
  timeline_id: string;
  role?: string | null;
  importance_score: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateMembershipPayload {
  journal_entry_id: string;
  timeline_id: string;
  role?: string;
  importance_score?: number;
  metadata?: Record<string, unknown>;
}

export class TimelineMembershipService {
  /**
   * Add a memory to a timeline
   */
  async addMemoryToTimeline(
    userId: string,
    payload: CreateMembershipPayload
  ): Promise<TimelineMembership> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timeline_memberships')
        .insert({
          user_id: userId,
          journal_entry_id: payload.journal_entry_id,
          timeline_id: payload.timeline_id,
          role: payload.role || null,
          importance_score: payload.importance_score ?? 0.5,
          metadata: payload.metadata || {}
        })
        .select()
        .single();

      if (error) {
        // If duplicate, return existing membership
        if (error.code === '23505') {
          return this.getMembership(userId, payload.journal_entry_id, payload.timeline_id);
        }
        logger.error({ error, userId, payload }, 'Failed to add memory to timeline');
        throw error;
      }

      return this.mapMembershipFromDb(data);
    } catch (error) {
      logger.error({ error, userId }, 'Error in addMemoryToTimeline');
      throw error;
    }
  }

  /**
   * Remove a memory from a timeline
   */
  async removeMemoryFromTimeline(
    userId: string,
    journalEntryId: string,
    timelineId: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('timeline_memberships')
        .delete()
        .eq('user_id', userId)
        .eq('journal_entry_id', journalEntryId)
        .eq('timeline_id', timelineId);

      if (error) {
        logger.error({ error, userId, journalEntryId, timelineId }, 'Failed to remove memory from timeline');
        throw error;
      }
    } catch (error) {
      logger.error({ error, userId }, 'Error in removeMemoryFromTimeline');
      throw error;
    }
  }

  /**
   * Get all timelines for a memory
   */
  async getTimelinesForMemory(
    userId: string,
    journalEntryId: string
  ): Promise<TimelineMembership[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timeline_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('journal_entry_id', journalEntryId)
        .order('importance_score', { ascending: false });

      if (error) {
        logger.error({ error, userId, journalEntryId }, 'Failed to get timelines for memory');
        throw error;
      }

      return (data || []).map(row => this.mapMembershipFromDb(row));
    } catch (error) {
      logger.error({ error, userId }, 'Error in getTimelinesForMemory');
      throw error;
    }
  }

  /**
   * Get all memories for a timeline
   */
  async getMemoriesForTimeline(
    userId: string,
    timelineId: string,
    limit?: number
  ): Promise<TimelineMembership[]> {
    try {
      let query = supabaseAdmin
        .from('timeline_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('timeline_id', timelineId)
        .order('importance_score', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId, timelineId }, 'Failed to get memories for timeline');
        throw error;
      }

      return (data || []).map(row => this.mapMembershipFromDb(row));
    } catch (error) {
      logger.error({ error, userId }, 'Error in getMemoriesForTimeline');
      throw error;
    }
  }

  /**
   * Update membership (role, importance, etc.)
   */
  async updateMembership(
    userId: string,
    membershipId: string,
    updates: {
      role?: string;
      importance_score?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<TimelineMembership> {
    try {
      const updateData: any = {};
      if (updates.role !== undefined) updateData.role = updates.role;
      if (updates.importance_score !== undefined) updateData.importance_score = updates.importance_score;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      const { data, error } = await supabaseAdmin
        .from('timeline_memberships')
        .update(updateData)
        .eq('user_id', userId)
        .eq('id', membershipId)
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, membershipId }, 'Failed to update membership');
        throw error;
      }

      return this.mapMembershipFromDb(data);
    } catch (error) {
      logger.error({ error, userId }, 'Error in updateMembership');
      throw error;
    }
  }

  /**
   * Get a specific membership
   */
  private async getMembership(
    userId: string,
    journalEntryId: string,
    timelineId: string
  ): Promise<TimelineMembership> {
    const { data, error } = await supabaseAdmin
      .from('timeline_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('journal_entry_id', journalEntryId)
      .eq('timeline_id', timelineId)
      .single();

    if (error) {
      throw error;
    }

    return this.mapMembershipFromDb(data);
  }

  /**
   * Map database row to TimelineMembership interface
   */
  private mapMembershipFromDb(row: any): TimelineMembership {
    return {
      id: row.id,
      user_id: row.user_id,
      journal_entry_id: row.journal_entry_id,
      timeline_id: row.timeline_id,
      role: row.role,
      importance_score: row.importance_score || 0.5,
      metadata: row.metadata || {},
      created_at: row.created_at
    };
  }
}

export const timelineMembershipService = new TimelineMembershipService();

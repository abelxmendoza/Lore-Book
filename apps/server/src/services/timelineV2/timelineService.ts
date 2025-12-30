import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type TimelineType = 'life_era' | 'sub_timeline' | 'skill' | 'location' | 'work' | 'custom';

export interface Timeline {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  timeline_type: TimelineType;
  parent_id?: string | null;
  start_date: string;
  end_date?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  children?: Timeline[];
  member_count?: number;
}

export interface CreateTimelinePayload {
  title: string;
  description?: string;
  timeline_type: TimelineType;
  parent_id?: string | null;
  start_date: string;
  end_date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTimelinePayload {
  title?: string;
  description?: string;
  timeline_type?: TimelineType;
  parent_id?: string | null;
  start_date?: string;
  end_date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class TimelineService {
  /**
   * Create a new timeline
   */
  async createTimeline(userId: string, payload: CreateTimelinePayload): Promise<Timeline> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timelines')
        .insert({
          user_id: userId,
          title: payload.title,
          description: payload.description || null,
          timeline_type: payload.timeline_type,
          parent_id: payload.parent_id || null,
          start_date: payload.start_date,
          end_date: payload.end_date || null,
          tags: payload.tags || [],
          metadata: payload.metadata || {}
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, payload }, 'Failed to create timeline');
        throw error;
      }

      return this.mapTimelineFromDb(data);
    } catch (error) {
      logger.error({ error, userId }, 'Error in createTimeline');
      throw error;
    }
  }

  /**
   * Get a timeline by ID
   */
  async getTimeline(userId: string, timelineId: string): Promise<Timeline | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('timelines')
        .select('*')
        .eq('user_id', userId)
        .eq('id', timelineId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        logger.error({ error, userId, timelineId }, 'Failed to get timeline');
        throw error;
      }

      return this.mapTimelineFromDb(data);
    } catch (error) {
      logger.error({ error, userId, timelineId }, 'Error in getTimeline');
      throw error;
    }
  }

  /**
   * Get timeline with full hierarchy (children recursively)
   */
  async getTimelineHierarchy(userId: string, timelineId: string): Promise<Timeline | null> {
    try {
      const timeline = await this.getTimeline(userId, timelineId);
      if (!timeline) {
        return null;
      }

      // Get all children recursively
      const children = await this.getChildrenRecursive(userId, timelineId);
      timeline.children = children;

      // Get member count
      timeline.member_count = await this.getMemberCount(userId, timelineId);

      return timeline;
    } catch (error) {
      logger.error({ error, userId, timelineId }, 'Error in getTimelineHierarchy');
      throw error;
    }
  }

  /**
   * Get all timelines for a user (optionally filtered)
   */
  async listTimelines(
    userId: string,
    filters?: {
      timeline_type?: TimelineType;
      parent_id?: string | null;
      search?: string;
    }
  ): Promise<Timeline[]> {
    try {
      let query = supabaseAdmin
        .from('timelines')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (filters?.timeline_type) {
        query = query.eq('timeline_type', filters.timeline_type);
      }

      if (filters?.parent_id !== undefined) {
        if (filters.parent_id === null) {
          query = query.is('parent_id', null);
        } else {
          query = query.eq('parent_id', filters.parent_id);
        }
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId, filters }, 'Failed to list timelines');
        throw error;
      }

      return (data || []).map(row => this.mapTimelineFromDb(row));
    } catch (error) {
      logger.error({ error, userId }, 'Error in listTimelines');
      throw error;
    }
  }

  /**
   * Update a timeline
   */
  async updateTimeline(
    userId: string,
    timelineId: string,
    payload: UpdateTimelinePayload
  ): Promise<Timeline> {
    try {
      const updateData: any = {};

      if (payload.title !== undefined) updateData.title = payload.title;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.timeline_type !== undefined) updateData.timeline_type = payload.timeline_type;
      if (payload.parent_id !== undefined) updateData.parent_id = payload.parent_id;
      if (payload.start_date !== undefined) updateData.start_date = payload.start_date;
      if (payload.end_date !== undefined) updateData.end_date = payload.end_date;
      if (payload.tags !== undefined) updateData.tags = payload.tags;
      if (payload.metadata !== undefined) updateData.metadata = payload.metadata;

      const { data, error } = await supabaseAdmin
        .from('timelines')
        .update(updateData)
        .eq('user_id', userId)
        .eq('id', timelineId)
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, timelineId, payload }, 'Failed to update timeline');
        throw error;
      }

      return this.mapTimelineFromDb(data);
    } catch (error) {
      logger.error({ error, userId, timelineId }, 'Error in updateTimeline');
      throw error;
    }
  }

  /**
   * Delete a timeline (cascades to children via DB constraint)
   */
  async deleteTimeline(userId: string, timelineId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('timelines')
        .delete()
        .eq('user_id', userId)
        .eq('id', timelineId);

      if (error) {
        logger.error({ error, userId, timelineId }, 'Failed to delete timeline');
        throw error;
      }
    } catch (error) {
      logger.error({ error, userId, timelineId }, 'Error in deleteTimeline');
      throw error;
    }
  }

  /**
   * Get all root timelines (no parent) for a user
   */
  async getRootTimelines(userId: string): Promise<Timeline[]> {
    return this.listTimelines(userId, { parent_id: null });
  }

  /**
   * Get direct children of a timeline
   */
  async getChildren(userId: string, parentId: string): Promise<Timeline[]> {
    return this.listTimelines(userId, { parent_id: parentId });
  }

  /**
   * Get children recursively
   */
  private async getChildrenRecursive(userId: string, parentId: string): Promise<Timeline[]> {
    const directChildren = await this.getChildren(userId, parentId);
    
    const childrenWithSubChildren = await Promise.all(
      directChildren.map(async (child) => {
        const subChildren = await this.getChildrenRecursive(userId, child.id);
        return {
          ...child,
          children: subChildren,
          member_count: await this.getMemberCount(userId, child.id)
        };
      })
    );

    return childrenWithSubChildren;
  }

  /**
   * Get member count for a timeline
   */
  private async getMemberCount(userId: string, timelineId: string): Promise<number> {
    try {
      const { count, error } = await supabaseAdmin
        .from('timeline_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('timeline_id', timelineId);

      if (error) {
        logger.error({ error }, 'Failed to get member count');
        return 0;
      }

      return count || 0;
    } catch (error) {
      logger.error({ error }, 'Error getting member count');
      return 0;
    }
  }

  /**
   * Map database row to Timeline interface
   */
  private mapTimelineFromDb(row: any): Timeline {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      timeline_type: row.timeline_type,
      parent_id: row.parent_id,
      start_date: row.start_date,
      end_date: row.end_date,
      tags: row.tags || [],
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const timelineService = new TimelineService();

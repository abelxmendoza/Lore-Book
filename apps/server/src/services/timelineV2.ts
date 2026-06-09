import { supabaseAdmin } from './supabaseClient';

export interface TimelineV2 {
  id: string;
  user_id: string;
  title: string;
  timeline_type: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

export const timelineService = {
  async listTimelines(userId: string): Promise<TimelineV2[]> {
    const { data, error } = await supabaseAdmin
      .from('timelines_v2')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createTimeline(userId: string, input: Partial<TimelineV2>): Promise<TimelineV2> {
    const { data, error } = await supabaseAdmin
      .from('timelines_v2')
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getTimelineHierarchy(userId: string, id: string): Promise<TimelineV2 | null> {
    const { data } = await supabaseAdmin
      .from('timelines_v2')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .single();
    return data ?? null;
  },

  async updateTimeline(userId: string, id: string, patch: Partial<TimelineV2>): Promise<TimelineV2> {
    const { data, error } = await supabaseAdmin
      .from('timelines_v2')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTimeline(userId: string, id: string): Promise<void> {
    await supabaseAdmin
      .from('timelines_v2')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
  },
};

export const timelineMembershipService = {
  async getMemberships(timelineId: string) {
    const { data } = await supabaseAdmin
      .from('timeline_v2_memberships')
      .select('*')
      .eq('timeline_id', timelineId);
    return data ?? [];
  },
};

export const timelineSearchService = {
  async search(userId: string, query: string) {
    const { data } = await supabaseAdmin
      .from('timelines_v2')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', `%${query}%`);
    return data ?? [];
  },
};

export const timelineRelationshipService = {
  async getRelationships(timelineId: string) {
    const { data } = await supabaseAdmin
      .from('timeline_v2_relationships')
      .select('*')
      .eq('timeline_id', timelineId);
    return data ?? [];
  },
};

import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import { supabaseAdmin } from '../supabaseClient';

export type TimePrecision = 'exact' | 'day' | 'month' | 'year' | 'approximate';

export interface ChronologyEntry {
  id: string;
  user_id: string;
  journal_entry_id: string;
  start_time: string;
  end_time?: string | null;
  time_precision: TimePrecision;
  time_confidence: number;
  content: string;
  timeline_memberships: string[]; // Timeline IDs
  timeline_names?: string[]; // Timeline names (optional, populated by backend)
}

export interface ChronologyOverlap {
  entry1_id: string;
  entry2_id: string;
  overlap_start: string;
  overlap_end: string;
  overlap_duration_days: number;
}

export interface ChronologyConstraint {
  type: 'impossible_overlap' | 'contradiction' | 'gap' | 'precision_mismatch';
  entry_id?: string;
  entry_ids?: string[];
  message: string;
  severity: 'warning' | 'error';
}

export interface TimeBucket {
  year?: number;
  month?: string; // YYYY-MM format
  decade?: number;
  entry_count: number;
  entries: ChronologyEntry[];
}

export class ChronologyService {
  /**
   * Get chronological order of all memories for a user
   * Optionally filter by timeline IDs
   */
  async getChronologicalOrder(
    userId: string,
    startTime?: string,
    endTime?: string,
    timelineIds?: string[]
  ): Promise<ChronologyEntry[]> {
    try {
      let query = supabaseAdmin
        .from('chronology_index')
        .select(`
          *,
          journal_entries!inner(id, content, user_id)
        `)
        .eq('user_id', userId)
        .order('start_time', { ascending: true });

      if (startTime) {
        query = query.gte('start_time', startTime);
      }
      if (endTime) {
        query = query.lte('start_time', endTime);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to get chronological order');
        throw error;
      }

      // Get timeline memberships for each entry
      const entryIds = (data || []).map((row: any) => row.journal_entry_id);
      const memberships = await this.getTimelineMembershipsForEntries(userId, entryIds);

      // Get timeline names for all unique timeline IDs
      const allTimelineIds = new Set<string>();
      Object.values(memberships).forEach((ids: string[]) => {
        ids.forEach(id => allTimelineIds.add(id));
      });
      const timelineNames = await this.getTimelineNames(userId, Array.from(allTimelineIds));

      // Filter by timeline IDs if provided
      let filteredData = data || [];
      if (timelineIds && timelineIds.length > 0) {
        filteredData = filteredData.filter((row: any) => {
          const entryMemberships = memberships[row.journal_entry_id] || [];
          return entryMemberships.some((tid: string) => timelineIds.includes(tid));
        });
      }

      return filteredData.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        journal_entry_id: row.journal_entry_id,
        start_time: row.start_time,
        end_time: row.end_time,
        time_precision: row.time_precision,
        time_confidence: row.time_confidence || 1.0,
        content: row.journal_entries?.content || '',
        timeline_memberships: memberships[row.journal_entry_id] || [],
        timeline_names: (memberships[row.journal_entry_id] || []).map((tid: string) => timelineNames[tid] || 'Unknown Timeline')
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Error in getChronologicalOrder');
      throw error;
    }
  }

  /**
   * Detect overlapping memories
   */
  async detectOverlaps(userId: string, entryId?: string): Promise<ChronologyOverlap[]> {
    try {
      // Get all entries with time ranges
      let query = supabaseAdmin
        .from('chronology_index')
        .select('*')
        .eq('user_id', userId)
        .not('end_time', 'is', null);

      if (entryId) {
        query = query.eq('journal_entry_id', entryId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to detect overlaps');
        throw error;
      }

      const entries = (data || []).filter(
        (e: any) => e.start_time && e.end_time
      ) as Array<{
        journal_entry_id: string;
        start_time: string;
        end_time: string;
      }>;

      const overlaps: ChronologyOverlap[] = [];

      // Check all pairs for overlaps
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const entry1 = entries[i];
          const entry2 = entries[j];

          const overlap = this.calculateOverlap(
            entry1.start_time,
            entry1.end_time,
            entry2.start_time,
            entry2.end_time
          );

          if (overlap) {
            overlaps.push({
              entry1_id: entry1.journal_entry_id,
              entry2_id: entry2.journal_entry_id,
              overlap_start: overlap.start,
              overlap_end: overlap.end,
              overlap_duration_days: overlap.durationDays
            });
          }
        }
      }

      return overlaps;
    } catch (error) {
      logger.error({ error, userId }, 'Error in detectOverlaps');
      throw error;
    }
  }

  /**
   * Validate chronology for an entry
   */
  async validateChronology(entry: MemoryEntry): Promise<ChronologyConstraint[]> {
    const constraints: ChronologyConstraint[] = [];

    try {
      // Check if entry has valid time data
      if (!entry.date) {
        constraints.push({
          type: 'gap',
          entry_id: entry.id,
          message: 'Entry missing date',
          severity: 'error'
        });
        return constraints;
      }

      // Check for impossible overlaps (e.g., two full-time jobs at same time)
      if (entry.end_time) {
        const overlaps = await this.detectOverlaps(entry.user_id, entry.id);
        
        // Filter for potentially problematic overlaps
        const problematic = overlaps.filter(o => {
          // Check if entries have conflicting metadata (e.g., both marked as full-time jobs)
          // This is a simplified check - could be enhanced with metadata analysis
          return o.overlap_duration_days > 30; // Overlap longer than 30 days
        });

        problematic.forEach(overlap => {
          constraints.push({
            type: 'impossible_overlap',
            entry_ids: [entry.id, overlap.entry1_id === entry.id ? overlap.entry2_id : overlap.entry1_id],
            message: `Potential impossible overlap detected (${overlap.overlap_duration_days} days)`,
            severity: 'warning'
          });
        });
      }

      // Check precision consistency
      if (entry.time_precision && entry.time_precision !== 'exact') {
        // If precision is approximate, confidence should be lower
        if (entry.time_confidence && entry.time_confidence > 0.8 && entry.time_precision === 'approximate') {
          constraints.push({
            type: 'precision_mismatch',
            entry_id: entry.id,
            message: 'High confidence with approximate precision may be inconsistent',
            severity: 'warning'
          });
        }
      }

      return constraints;
    } catch (error) {
      logger.error({ error, entryId: entry.id }, 'Error in validateChronology');
      return constraints;
    }
  }

  /**
   * Get memories grouped by time scale (buckets)
   */
  async getTimeBuckets(
    userId: string,
    resolution: 'decade' | 'year' | 'month' = 'year'
  ): Promise<TimeBucket[]> {
    try {
      let groupBy: string;
      let selectFields: string;

      switch (resolution) {
        case 'decade':
          groupBy = 'decade_bucket';
          selectFields = 'decade_bucket, COUNT(*) as entry_count';
          break;
        case 'year':
          groupBy = 'year_bucket';
          selectFields = 'year_bucket, COUNT(*) as entry_count';
          break;
        case 'month':
          groupBy = 'month_bucket';
          selectFields = 'month_bucket, COUNT(*) as entry_count';
          break;
        default:
          groupBy = 'year_bucket';
          selectFields = 'year_bucket, COUNT(*) as entry_count';
      }

      const { data, error } = await supabaseAdmin
        .from('chronology_index')
        .select(`
          ${groupBy},
          journal_entry_id,
          start_time,
          end_time,
          time_precision,
          journal_entries!inner(id, content)
        `)
        .eq('user_id', userId)
        .order(groupBy, { ascending: true });

      if (error) {
        logger.error({ error, userId }, 'Failed to get time buckets');
        throw error;
      }

      // Group by bucket
      const buckets = new Map<string, TimeBucket>();

      (data || []).forEach((row: any) => {
        const bucketKey = String(row[groupBy]);
        
        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, {
            [resolution === 'decade' ? 'decade' : resolution === 'year' ? 'year' : 'month']: 
              resolution === 'month' ? bucketKey : parseInt(bucketKey),
            entry_count: 0,
            entries: []
          });
        }

        const bucket = buckets.get(bucketKey)!;
        bucket.entry_count++;
        bucket.entries.push({
          id: row.id,
          user_id: userId,
          journal_entry_id: row.journal_entry_id,
          start_time: row.start_time,
          end_time: row.end_time,
          time_precision: row.time_precision,
          time_confidence: 1.0,
          content: row.journal_entries?.content || '',
          timeline_memberships: []
        });
      });

      return Array.from(buckets.values());
    } catch (error) {
      logger.error({ error, userId }, 'Error in getTimeBuckets');
      throw error;
    }
  }

  /**
   * Get timeline memberships for entries
   */
  private async getTimelineMembershipsForEntries(
    userId: string,
    entryIds: string[]
  ): Promise<Record<string, string[]>> {
    if (entryIds.length === 0) {
      return {};
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('timeline_memberships')
        .select('journal_entry_id, timeline_id')
        .eq('user_id', userId)
        .in('journal_entry_id', entryIds);

      if (error) {
        logger.error({ error }, 'Failed to get timeline memberships');
        return {};
      }

      const memberships: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        if (!memberships[row.journal_entry_id]) {
          memberships[row.journal_entry_id] = [];
        }
        memberships[row.journal_entry_id].push(row.timeline_id);
      });

      return memberships;
    } catch (error) {
      logger.error({ error }, 'Error getting timeline memberships');
      return {};
    }
  }

  /**
   * Get timeline names for timeline IDs
   */
  private async getTimelineNames(
    userId: string,
    timelineIds: string[]
  ): Promise<Record<string, string>> {
    if (timelineIds.length === 0) {
      return {};
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('timelines')
        .select('id, title')
        .eq('user_id', userId)
        .in('id', timelineIds);

      if (error) {
        logger.error({ error }, 'Failed to get timeline names');
        return {};
      }

      const names: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        names[row.id] = row.title;
      });

      return names;
    } catch (error) {
      logger.error({ error }, 'Error getting timeline names');
      return {};
    }
  }

  /**
   * Calculate overlap between two time ranges
   */
  private calculateOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): { start: string; end: string; durationDays: number } | null {
    const s1 = new Date(start1).getTime();
    const e1 = new Date(end1).getTime();
    const s2 = new Date(start2).getTime();
    const e2 = new Date(end2).getTime();

    const overlapStart = Math.max(s1, s2);
    const overlapEnd = Math.min(e1, e2);

    if (overlapStart < overlapEnd) {
      const durationMs = overlapEnd - overlapStart;
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      return {
        start: new Date(overlapStart).toISOString(),
        end: new Date(overlapEnd).toISOString(),
        durationDays
      };
    }

    return null;
  }
}

export const chronologyService = new ChronologyService();

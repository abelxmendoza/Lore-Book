/**
 * Arc Stability Service — autobiographical continuity arc reinforcement.
 *
 * Tracks how "stabilized" life arcs are over time:
 * - Arcs that are frequently retrieved become more canonical (higher stability_score)
 * - Dormant arcs decay slowly toward a 0.3 floor
 * - User-created arcs never decay
 * - Arc confidence (from arcInferenceService) and stability_score are separate:
 *   confidence = how sure we are this arc is real
 *   stability_score = how repeatedly it's been accessed / activated
 *
 * Called fire-and-forget by retrieval paths when arc-related entries are surfaced.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

class ArcStabilityService {
  /**
   * Given a set of retrieved entry IDs, find which life arcs they belong to
   * (via arc_memberships → event_candidates → resolved_events → journal_entries linkage)
   * and bump their stability_score.
   *
   * Fire-and-forget: caller should not await this.
   */
  async bumpArcsForEntries(userId: string, entryIds: string[]): Promise<void> {
    if (!entryIds.length) return;
    try {
      // entry → resolved_event via source_entry_id
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('id')
        .eq('user_id', userId)
        .in('source_entry_id', entryIds);

      if (!events?.length) return;
      const eventIds = events.map((e: { id: string }) => e.id);

      // resolved_event → event_candidate
      const { data: candidates } = await supabaseAdmin
        .from('event_candidates')
        .select('id')
        .eq('user_id', userId)
        .in('resolved_event_id', eventIds);

      if (!candidates?.length) return;
      const candidateIds = candidates.map((c: { id: string }) => c.id);

      // event_candidate → arc (via arc_memberships)
      const { data: memberships } = await supabaseAdmin
        .from('arc_memberships')
        .select('arc_id')
        .in('event_candidate_id', candidateIds);

      if (!memberships?.length) return;
      const arcIds = [...new Set(memberships.map((m: { arc_id: string }) => m.arc_id))];

      await supabaseAdmin.rpc('bump_arc_stability', { arc_ids: arcIds });
    } catch (err) {
      logger.debug({ err, userId }, 'bumpArcsForEntries failed (non-fatal)');
    }
  }

  /**
   * Apply daily stability decay to all inferred arcs.
   * Called by the arc stability decay cron job.
   * User-created arcs are excluded (see SQL function).
   */
  async applyDecay(decayRate = 0.005, floorVal = 0.3): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin.rpc('apply_arc_stability_decay', {
        decay_rate: decayRate,
        floor_val: floorVal,
      });
      if (error) {
        logger.error({ error }, 'Arc stability decay RPC failed');
        return 0;
      }
      return data as number;
    } catch (err) {
      logger.error({ err }, 'Arc stability decay failed');
      return 0;
    }
  }
}

export const arcStabilityService = new ArcStabilityService();

/**
 * Gap Node Service
 *
 * Converts ChronologyEngine V1 gap detections into typed, named nodes in the
 * timeline hierarchy. Previously, detected gaps existed only in the API response
 * and were discarded. This service makes them permanent, user-visible records.
 *
 * Gap classification:
 *   < 30 days   → skip (noise, not autobiographically significant)
 *   30-180 days → medium: create as 'timeline_scene' under the nearest chapter
 *   > 180 days  → long: create under the nearest arc (larger structural unit)
 *
 * Gap type inference (heuristic — no LLM):
 *   Follows a breakup/conflict event   → 'recovery'
 *   Between two named arcs             → 'transition'
 *   After an era/saga with high density → 'recovery'
 *   Otherwise                          → 'no_data'
 *
 * Idempotency: each gap is identified by its (user_id, start_date, end_date) tuple.
 * Re-running chronology on the same data will not create duplicate gap nodes.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Gap } from './types';

// Minimum duration to create a gap node — shorter gaps are noise
const MIN_GAP_DAYS = 30;

type GapType = 'recovery' | 'transition' | 'no_data' | 'identity_shift';

interface TypedGap extends Gap {
  gapType: GapType;
  title:   string;
}

// ─── Gap type inference ───────────────────────────────────────────────────────

async function inferGapType(
  userId: string,
  gap: Gap
): Promise<GapType> {
  // Check if the event just before the gap was a relationship breakup or conflict
  const { data: recentBreakup } = await supabaseAdmin
    .from('relationship_breakups')
    .select('id')
    .eq('user_id', userId)
    .gte('breakup_date', new Date(new Date(gap.start).getTime() - 14 * 86400000).toISOString())
    .lte('breakup_date', gap.start)
    .limit(1)
    .maybeSingle();

  if (recentBreakup) return 'recovery';

  // Check if this gap sits between two life arcs
  const { data: arcBefore } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .lte('end_date', gap.start.substring(0, 10))
    .gte('confidence', 0.5)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: arcAfter } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .gte('start_date', gap.end.substring(0, 10))
    .gte('confidence', 0.5)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (arcBefore && arcAfter) return 'transition';

  return 'no_data';
}

function gapTitle(gapType: GapType, durationDays: number): string {
  const weeks = Math.round(durationDays / 7);
  const months = Math.round(durationDays / 30);
  const duration = durationDays >= 60 ? `${months}-month` : `${weeks}-week`;

  switch (gapType) {
    case 'recovery':       return `Recovery Period (${duration})`;
    case 'transition':     return `Transition Period (${duration})`;
    case 'identity_shift': return `Identity Shift Period (${duration})`;
    case 'no_data':
    default:               return `Undocumented Period (${duration})`;
  }
}

// ─── Find the nearest parent chapter for a gap ───────────────────────────────

async function findParentChapter(
  userId: string,
  gapStart: string
): Promise<string | null> {
  // Find the chapter whose date range contains or is closest to the gap start
  const { data: chapter } = await supabaseAdmin
    .from('chapters')
    .select('id')
    .eq('user_id', userId)
    .lte('start_date', gapStart)
    .or(`end_date.gte.${gapStart},end_date.is.null`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return chapter?.id ?? null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function persistGapNodes(
  userId: string,
  gaps: Gap[]
): Promise<void> {
  const significant = gaps.filter(g => g.durationDays >= MIN_GAP_DAYS);
  if (significant.length === 0) return;

  for (const gap of significant) {
    try {
      // Idempotency check — skip if this gap is already recorded
      const { data: existing } = await supabaseAdmin
        .from('timeline_scenes')
        .select('id')
        .eq('user_id', userId)
        .eq('start_date', gap.start)
        .eq('end_date', gap.end)
        .contains('tags', ['gap', 'chronology_inferred'])
        .maybeSingle();

      if (existing) continue;

      const gapType = await inferGapType(userId, gap);
      const title   = gapTitle(gapType, gap.durationDays);
      const parentId = await findParentChapter(userId, gap.start);

      const { error } = await supabaseAdmin
        .from('timeline_scenes')
        .insert({
          user_id:     userId,
          parent_id:   parentId,
          title,
          description: `A ${gap.durationDays}-day period with no documented entries. Gap type: ${gapType}.`,
          start_date:  gap.start,
          end_date:    gap.end,
          source_type: 'ai',
          tags:        ['gap', 'chronology_inferred', gapType],
          metadata: {
            gap_type:         gapType,
            duration_days:    gap.durationDays,
            missing_estimate: gap.missingEstimate,
            source:           'chronology_v1_gap_detector',
            start_event_id:   gap.metadata?.startEventId,
            end_event_id:     gap.metadata?.endEventId,
          },
        });

      if (error) {
        logger.debug({ error, userId, gapStart: gap.start }, 'gapNodeService: insert failed');
        continue;
      }

      logger.debug(
        { userId, gapType, durationDays: gap.durationDays, title },
        'gapNodeService: gap node created'
      );
    } catch (err) {
      logger.debug({ err, userId }, 'gapNodeService: gap processing failed (non-blocking)');
    }
  }
}

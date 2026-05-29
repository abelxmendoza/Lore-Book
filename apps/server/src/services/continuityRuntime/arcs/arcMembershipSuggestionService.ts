import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { arcService } from './arcService';
import { arcMembershipService, type MembershipRole, type SetMembershipPayload } from './arcMembershipService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawCandidate {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  continuity_strength: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(date: string | null | undefined, fallback: number): number {
  if (!date) return fallback;
  const t = new Date(date).getTime();
  return isNaN(t) ? fallback : t;
}

/** Fraction of the candidate's span that falls inside the arc's span */
function containmentRatio(
  candStart: number, candEnd: number,
  arcStart: number, arcEnd: number
): number {
  const candDuration = candEnd - candStart;
  if (candDuration <= 0) return 0;
  const overlapStart = Math.max(candStart, arcStart);
  const overlapEnd = Math.min(candEnd, arcEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  return overlap / candDuration;
}

function inferRole(occurrenceCount: number, ratio: number): MembershipRole {
  if (occurrenceCount >= 5 && ratio >= 0.8) return 'defining_moment';
  if (occurrenceCount >= 3) return 'turning_point';
  return 'background';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ArcMembershipSuggestionService {
  /** Minimum containment ratio to link a candidate to an arc */
  private readonly CONTAIN_THRESHOLD = 0.50;

  /**
   * For every event_candidate that isn't yet linked to any arc_membership,
   * find the best-fit life_arc by temporal containment and create the membership.
   */
  async runForUser(userId: string): Promise<void> {
    // 1. Load all event_candidates
    const { data: candidateRows, error: candErr } = await supabaseAdmin
      .from('event_candidates')
      .select('id, first_seen_at, last_seen_at, occurrence_count, continuity_strength')
      .eq('user_id', userId);

    if (candErr) {
      logger.error({ candErr, userId }, 'arcMembershipSuggestion: failed to load candidates');
      return;
    }

    const candidates: RawCandidate[] = candidateRows ?? [];
    if (candidates.length === 0) return;

    // 2. Find candidates that already have at least one membership
    const { data: existingRows } = await supabaseAdmin
      .from('arc_memberships')
      .select('event_candidate_id')
      .eq('user_id', userId);

    const alreadyLinked = new Set((existingRows ?? []).map(r => r.event_candidate_id as string));

    const unlinked = candidates.filter(c => !alreadyLinked.has(c.id));
    if (unlinked.length === 0) {
      logger.debug({ userId }, 'arcMembershipSuggestion: all candidates already linked');
      return;
    }

    // 3. Load life_arcs
    const lifeArcs = await arcService.listForUser(userId);
    if (lifeArcs.length === 0) return;

    const now = Date.now();
    const payloads: SetMembershipPayload[] = [];

    for (const cand of unlinked) {
      const candStart = toMs(cand.first_seen_at, 0);
      const candEnd = toMs(cand.last_seen_at, now);

      let bestArc: (typeof lifeArcs)[number] | null = null;
      let bestRatio = 0;

      for (const arc of lifeArcs) {
        const arcStart = toMs(arc.start_date, 0);
        const arcEnd = toMs(arc.end_date, now);
        const ratio = containmentRatio(candStart, candEnd, arcStart, arcEnd);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestArc = arc;
        }
      }

      if (!bestArc || bestRatio < this.CONTAIN_THRESHOLD) continue;

      payloads.push({
        arc_id: bestArc.id,
        event_candidate_id: cand.id,
        importance_score: Math.round(cand.continuity_strength * bestRatio * 100) / 100,
        role: inferRole(cand.occurrence_count, bestRatio),
        metadata: { containment_ratio: Math.round(bestRatio * 100) / 100 },
      });
    }

    if (payloads.length === 0) return;

    await arcMembershipService.setMany(userId, payloads);
    logger.info(
      { userId, linked: payloads.length, unlinked: unlinked.length },
      'arcMembershipSuggestion: memberships created'
    );
  }
}

export const arcMembershipSuggestionService = new ArcMembershipSuggestionService();

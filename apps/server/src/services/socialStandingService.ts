/**
 * SocialStandingService — computed standing of people in the user's world.
 *
 * Three separable ideas, kept descriptive and never judgmental (computed
 * standing drives organization — sorting, filtering, graph views — not the
 * assistant's tone):
 *   1. public-figure status — flagged by the relationship classifier
 *      (metadata.public_figure / figure_type)
 *   2. inner-circle ranking — weighted score from signals we already track
 *   3. network position — degree centrality from event co-participation
 *
 * Output persists to characters.metadata.social_standing:
 *   { score, tier, degree, connector, computed_at }
 * Tiers: inner_circle | close | regular | peripheral | public_figure
 */

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export interface SocialStanding {
  score: number;        // 0..1
  tier: 'inner_circle' | 'close' | 'regular' | 'peripheral' | 'public_figure';
  degree: number;       // unique co-participants across events
  connector: boolean;   // bridges several people (degree >= 3)
  computed_at: string;
  overridden?: boolean; // tier pinned by the user (metadata.standing_override)
}

const VALID_TIERS: ReadonlyArray<SocialStanding['tier']> = [
  'inner_circle', 'close', 'regular', 'peripheral', 'public_figure',
];

type CharRow = {
  id: string;
  name: string;
  relationship_depth: string | null;
  importance_level: string | null;
  has_met: boolean | null;
  updated_at: string | null;
  metadata: Record<string, any> | null;
};

const DEPTH_SCORE: Record<string, number> = {
  mentioned_only: 0,
  casual: 0.33,
  moderate: 0.66,
  close: 1,
  deep: 1,
};

class SocialStandingService {
  /**
   * Recompute standing for every character of the user. Cheap: a handful of
   * set-based queries, no LLM.
   */
  async recompute(userId: string): Promise<{ updated: number }> {
    const { data: charData } = await supabaseAdmin
      .from('characters')
      .select('id, name, relationship_depth, importance_level, has_met, updated_at, metadata')
      .eq('user_id', userId);
    const chars = (charData ?? []) as CharRow[];
    if (chars.length === 0) return { updated: 0 };

    // Fact counts per character (one query)
    const { data: factRows } = await supabaseAdmin
      .from('entity_facts')
      .select('entity_id')
      .eq('user_id', userId)
      .eq('entity_type', 'character');
    const factCount = new Map<string, number>();
    for (const f of (factRows ?? []) as Array<{ entity_id: string }>) {
      factCount.set(f.entity_id, (factCount.get(f.entity_id) ?? 0) + 1);
    }

    // Event co-participation graph. resolved_events.people holds omega ids;
    // characters link back via metadata.omega_entity_id.
    const omegaToChar = new Map<string, string>();
    for (const c of chars) {
      const oid = c.metadata?.omega_entity_id as string | undefined;
      if (oid) omegaToChar.set(oid, c.id);
    }
    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('people')
      .eq('user_id', userId)
      .limit(500);
    const coParticipants = new Map<string, Set<string>>();
    const eventCount = new Map<string, number>();
    for (const ev of (events ?? []) as Array<{ people: string[] | null }>) {
      const charIds = (ev.people ?? []).map(p => omegaToChar.get(p)).filter(Boolean) as string[];
      for (const id of charIds) {
        eventCount.set(id, (eventCount.get(id) ?? 0) + 1);
        const set = coParticipants.get(id) ?? new Set<string>();
        for (const other of charIds) if (other !== id) set.add(other);
        coParticipants.set(id, set);
      }
    }

    const now = Date.now();
    let updated = 0;
    for (const c of chars) {
      const mentions = Number(c.metadata?.mention_count ?? 0);
      const facts = factCount.get(c.id) ?? 0;
      let depth = DEPTH_SCORE[c.relationship_depth ?? ''] ?? 0;
      // Kinship floor: family you've actually met shouldn't decay to
      // peripheral just because they're rarely written about.
      const isFamily = c.metadata?.relationship_type === 'family';
      if (isFamily && c.has_met !== false) depth = Math.max(depth, DEPTH_SCORE.close);
      const degree = coParticipants.get(c.id)?.size ?? 0;
      const events = eventCount.get(c.id) ?? 0;
      const daysSince = c.updated_at ? (now - new Date(c.updated_at).getTime()) / 86_400_000 : 365;
      const recency = Math.max(0, 1 - daysSince / 90); // fades over ~3 months

      // Saturating signals so one chatty week doesn't dominate forever
      const sat = (v: number, k: number) => v / (v + k);
      const score = Math.min(1,
        0.30 * sat(mentions, 6) +
        0.20 * sat(facts, 5) +
        0.20 * depth +
        0.15 * sat(degree + events, 4) +
        0.15 * recency
      );

      const isPublicFigure = Boolean(c.metadata?.public_figure);
      const computedTier: SocialStanding['tier'] =
        isPublicFigure && score < 0.6 ? 'public_figure'
        : score >= 0.6 ? 'inner_circle'
        : score >= 0.4 ? 'close'
        : score >= 0.2 ? 'regular'
        : 'peripheral';

      // User override wins over the computed tier; computed score is kept so
      // the organic signal stays visible alongside the pin.
      const overrideTier = c.metadata?.standing_override?.tier as SocialStanding['tier'] | undefined;
      const hasOverride = Boolean(overrideTier && VALID_TIERS.includes(overrideTier));

      const standing: SocialStanding = {
        score: Math.round(score * 100) / 100,
        tier: hasOverride ? overrideTier! : computedTier,
        degree,
        connector: degree >= 3,
        computed_at: new Date().toISOString(),
        ...(hasOverride ? { overridden: true } : {}),
      };

      await supabaseAdmin
        .from('characters')
        .update({ metadata: { ...(c.metadata ?? {}), social_standing: standing } })
        .eq('id', c.id)
        .eq('user_id', userId);
      updated++;
    }

    logger.info({ userId, updated }, 'Social standing recomputed');
    return { updated };
  }
}

export const socialStandingService = new SocialStandingService();

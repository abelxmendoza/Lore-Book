import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { arcService } from './arcService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegacyArc {
  id: string;
  user_id: string;
  label: string;
  summary: string | null;
  start_date: string;
  end_date: string | null;
}

export interface ReconciliationResult {
  matched: number;
  adopted: number;
  skipped: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMs(date: string | null | undefined, fallback: number): number {
  if (!date) return fallback;
  const t = new Date(date).getTime();
  return isNaN(t) ? fallback : t;
}

/**
 * What fraction of the legacy arc's span overlaps with a life_arc?
 * Returns 0–1.
 */
function overlapRatio(
  legStart: number, legEnd: number,
  lifeStart: number, lifeEnd: number
): number {
  const legDuration = legEnd - legStart;
  if (legDuration <= 0) return 0;
  const overlapStart = Math.max(legStart, lifeStart);
  const overlapEnd = Math.min(legEnd, lifeEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  return overlap / legDuration;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ArcReconciliationService {
  /** Overlap fraction required to consider two arcs the same period */
  private readonly MATCH_THRESHOLD = 0.75;
  /** Minimum duration (days) for an orphan legacy arc to be adopted into life_arcs */
  private readonly ADOPT_MIN_DAYS = 14;

  async runForUser(userId: string): Promise<ReconciliationResult> {
    const result: ReconciliationResult = { matched: 0, adopted: 0, skipped: 0 };

    const { data: legacyRows, error: legErr } = await supabaseAdmin
      .from('arcs')
      .select('id, user_id, label, summary, start_date, end_date')
      .eq('user_id', userId);

    if (legErr) {
      logger.error({ legErr, userId }, 'arcReconciliation: failed to load legacy arcs');
      return result;
    }

    const legacyArcs = (legacyRows ?? []) as LegacyArc[];
    if (legacyArcs.length === 0) return result;

    const lifeArcs = await arcService.listForUser(userId);
    const now = Date.now();

    for (const leg of legacyArcs) {
      const legStart = toMs(leg.start_date, 0);
      const legEnd = toMs(leg.end_date, now);

      // Find the life_arc with the highest temporal overlap
      let bestMatch: (typeof lifeArcs)[number] | null = null;
      let bestRatio = 0;

      for (const life of lifeArcs) {
        const lifeStart = toMs(life.start_date, 0);
        const lifeEnd = toMs(life.end_date, now);
        const ratio = overlapRatio(legStart, legEnd, lifeStart, lifeEnd);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMatch = life;
        }
      }

      if (bestMatch && bestRatio >= this.MATCH_THRESHOLD) {
        // A life_arc already covers this period — stamp link if not present
        if (bestMatch.metadata?.legacy_arc_id !== leg.id) {
          await arcService.update(userId, bestMatch.id, {
            metadata: {
              ...bestMatch.metadata,
              legacy_arc_id: leg.id,
              legacy_label: leg.label,
              overlap_ratio: Math.round(bestRatio * 100) / 100,
            },
          });
          result.matched++;
          logger.debug(
            { userId, legId: leg.id, lifeId: bestMatch.id, ratio: bestRatio },
            'arcReconciliation: matched legacy → life_arc'
          );
        }
        continue;
      }

      // No life_arc covers this period — adopt it if it's substantial
      const legDurationDays = (legEnd - legStart) / (1000 * 60 * 60 * 24);
      if (legDurationDays < this.ADOPT_MIN_DAYS) {
        result.skipped++;
        continue;
      }

      try {
        await arcService.upsert(userId, {
          title: leg.label,
          arc_type: 'life_era',
          start_date: leg.start_date,
          end_date: leg.end_date ?? null,
          is_active: !leg.end_date,
          summary: leg.summary,
          confidence: 0.6,
          source: 'user_created',
          metadata: {
            legacy_arc_id: leg.id,
            legacy_label: leg.label,
            adopted_from: 'timeline_arcs',
          },
        });
        result.adopted++;
        logger.info(
          { userId, legId: leg.id, label: leg.label },
          'arcReconciliation: adopted orphan legacy arc into life_arcs'
        );
      } catch (err) {
        logger.warn({ err, userId, legId: leg.id }, 'arcReconciliation: failed to adopt arc');
        result.skipped++;
      }
    }

    logger.info({ userId, ...result }, 'arcReconciliation: run complete');
    return result;
  }
}

export const arcReconciliationService = new ArcReconciliationService();

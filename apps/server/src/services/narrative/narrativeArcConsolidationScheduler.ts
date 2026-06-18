/**
 * Debounced live consolidation — runs after story-block ingestion without waiting for nightly cron.
 */
import { logger } from '../../logger';
import { narrativeArcConsolidationService } from './narrativeArcConsolidationService';

const pending = new Map<string, NodeJS.Timeout>();

function debounceMs(): number {
  return Number(process.env.NARRATIVE_ARC_DEBOUNCE_MS ?? 60_000);
}

function liveEnabled(): boolean {
  return process.env.NARRATIVE_ARC_LIVE !== '0';
}

export function scheduleNarrativeArcConsolidation(userId: string, reason = 'story_block'): void {
  if (!liveEnabled() || !userId) return;

  const existing = pending.get(userId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pending.delete(userId);
    void narrativeArcConsolidationService
      .runForUser(userId)
      .then(({ arcs, memberships }) => {
        if (arcs > 0) {
          logger.info({ userId, reason, arcs, memberships }, 'narrativeArcConsolidation: live run complete');
        }
      })
      .catch((err) => {
        logger.debug({ err, userId, reason }, 'narrativeArcConsolidation: live run failed');
      });
  }, debounceMs());

  if (typeof timer.unref === 'function') timer.unref();
  pending.set(userId, timer);
}

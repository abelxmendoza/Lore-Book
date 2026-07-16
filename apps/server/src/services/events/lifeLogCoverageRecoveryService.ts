/**
 * Autonomous Life Log coverage repair.
 *
 * Repairs both gaps in the source pipeline:
 *  1. autobiographical chat rows that produced no extracted artifacts;
 *  2. older EXPERIENCE units that fell outside normal 30-day assembly.
 *
 * Every downstream writer is replay-safe. A short per-user cooldown keeps page
 * loads and ingestion bursts from repeating the same bounded scan.
 */
import { logger } from '../../logger';
import { eventAssemblyService } from '../conversationCentered/eventAssemblyService';
import { ingestionRecoveryService } from '../ingestion/ingestionRecoveryService';

const COOLDOWN_MS = 60_000;
const lastStartedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

export async function recoverLifeLogCoverageForUser(userId: string): Promise<void> {
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const previous = lastStartedAt.get(userId) ?? 0;
  if (Date.now() - previous < COOLDOWN_MS) return;
  lastStartedAt.set(userId, Date.now());

  const task = (async () => {
    const recovery = await ingestionRecoveryService.scan({ userId, dryRun: false, limit: 100 });
    const events = await eventAssemblyService.assembleEvents(userId, undefined, { windowDays: 365 });
    logger.info(
      {
        userId,
        artifactGapsFound: recovery.summary.artifactGaps,
        artifactGapsQueued: recovery.summary.artifactGapsQueued,
        providerRecoveryQueued: recovery.summary.providerRecoveryQueued,
        missingJobsQueued:
          recovery.summary.enqueued -
          recovery.summary.artifactGapsQueued -
          recovery.summary.providerRecoveryQueued,
        eventsReassembled: events.length,
      },
      'Life Log coverage recovery completed',
    );
  })()
    .catch((error) => {
      logger.warn({ error, userId }, 'Life Log coverage recovery failed');
    })
    .finally(() => {
      inFlight.delete(userId);
    });

  inFlight.set(userId, task);
  return task;
}

export function scheduleLifeLogCoverageRecovery(userId: string): void {
  void recoverLifeLogCoverageForUser(userId);
}

#!/usr/bin/env tsx
/**
 * Recover missing timeline events from chat/facts/summaries.
 * Run: RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/recoverEvents.ts
 */
import { eventRecoveryService } from '../services/eventRecoveryService';
import { logger } from '../logger';

const uid = process.env.RECOVERY_USER_ID ?? process.env.TARGET_USER_ID ?? '';
if (!uid) {
  console.error('Required: RECOVERY_USER_ID or TARGET_USER_ID environment variable.');
  process.exit(1);
}

async function main() {
  const stats = await eventRecoveryService.recoverMissingEvents(uid);
  const coverage = await eventRecoveryService.benchmarkCoverage(uid);
  logger.info({ stats, coverage }, 'Event recovery complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

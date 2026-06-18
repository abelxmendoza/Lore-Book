#!/usr/bin/env tsx
/**
 * Unified diagnostic audit runner.
 *
 * Consolidates the former standalone audit scripts into one entrypoint with
 * suite-based dispatch. Each suite runs one or more checks sequentially.
 *
 * Usage:
 *   npx tsx apps/server/scripts/audit.ts wma [--check memory|classification|goals|recall]
 *   npx tsx apps/server/scripts/audit.ts story [--check story-chat|arcs|life-story-api|reconstruction|scorecard] [--full-rag]
 *   npx tsx apps/server/scripts/audit.ts episodes [--check activation|quality] [--user-id <uuid>]
 *   npx tsx apps/server/scripts/audit.ts integrity [--check chat-trust|shadow-baseline]
 *   npx tsx apps/server/scripts/audit.ts all
 *
 * User targeting (when required by a check):
 *   --user-id <uuid>   or comma-separated list
 *   Env fallbacks: TARGET_USER_ID, RECALL_TEST_USER_ID, EPISODE_USER_ID, RECOVERY_USER_ID
 */
import '../src/config';
import { pathToFileURL } from 'url';
import { parseArg } from './lib/auditCommon';
import { runWmaSuite, type WmaCheck } from './audits/wma';
import { runStorySuite, type StoryCheck } from './audits/story';
import { runEpisodesSuite, type EpisodeCheck } from './audits/episodes';
import { runIntegritySuite, type IntegrityCheck } from './audits/integrity';

export type AuditSuite = 'wma' | 'story' | 'episodes' | 'integrity' | 'all';

const WMA_CHECKS = new Set<WmaCheck>(['memory', 'classification', 'goals', 'recall']);
const STORY_CHECKS = new Set<StoryCheck>(['story-chat', 'arcs', 'life-story-api', 'reconstruction', 'scorecard']);
const EPISODE_CHECKS = new Set<EpisodeCheck>(['activation', 'quality']);
const INTEGRITY_CHECKS = new Set<IntegrityCheck>(['chat-trust', 'shadow-baseline']);

function parseChecks<T extends string>(argv: string[], allowed: Set<T>): T[] | undefined {
  const raw = parseArg(argv, '--check');
  if (!raw) return undefined;
  const checks = raw.split(',').map((s) => s.trim()).filter(Boolean) as T[];
  for (const c of checks) {
    if (!allowed.has(c)) throw new Error(`Unknown --check value: ${c}. Allowed: ${[...allowed].join(', ')}`);
  }
  return checks;
}

export async function resolveAuditCommand(argv: string[]): Promise<{ suite: AuditSuite; rest: string[] } | null> {
  const [suite, ...rest] = argv;
  if (!suite || !['wma', 'story', 'episodes', 'integrity', 'all'].includes(suite)) return null;
  return { suite: suite as AuditSuite, rest };
}

export async function runAudit(argv: string[]): Promise<void> {
  const resolved = await resolveAuditCommand(argv);
  if (!resolved) {
    throw new Error(
      'Usage: audit.ts <wma|story|episodes|integrity|all> [--check <name[,name...]>] [--user-id <uuid>] [--full-rag]',
    );
  }

  const { suite, rest } = resolved;

  if (suite === 'all') {
    await runWmaSuite(undefined, rest);
    await runStorySuite(undefined, rest);
    await runEpisodesSuite(undefined, rest);
    await runIntegritySuite(undefined);
    return;
  }

  switch (suite) {
    case 'wma':
      await runWmaSuite(parseChecks(rest, WMA_CHECKS), rest);
      break;
    case 'story':
      await runStorySuite(parseChecks(rest, STORY_CHECKS), rest);
      break;
    case 'episodes':
      await runEpisodesSuite(parseChecks(rest, EPISODE_CHECKS), rest);
      break;
    case 'integrity':
      await runIntegritySuite(parseChecks(rest, INTEGRITY_CHECKS));
      break;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runAudit(process.argv.slice(2)).catch((err) => {
    console.error('\n❌', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
/**
 * Sprint AL — Backfill scoring passes (characters / events / relationships).
 *
 * Consolidates the former backfill-character-importance / backfill-event-significance /
 * backfill-relationship-scores scripts (they were identical except the service called).
 *
 * Usage:
 *   tsx scripts/backfill-scores.ts <characters|events|relationships|all> --user <email>
 *   tsx scripts/backfill-scores.ts <characters|events|relationships|all> --user-id <uuid>
 */

import { pathToFileURL } from 'url';
import { supabaseAdmin } from '../apps/server/src/services/supabaseClient';
import { scoreAllCharactersForUser } from '../apps/server/src/services/characters/characterImportanceService';
import { scoreAllEventsForUser } from '../apps/server/src/services/events/eventSignificanceService';
import { scoreAllRelationshipsForUser } from '../apps/server/src/services/relationships/relationshipScoringService';

export type Target = 'characters' | 'events' | 'relationships';

export const SCORERS: Record<Target, { label: string; noun: string; run: (userId: string) => Promise<{ scored: number }> }> = {
  characters: { label: 'character importance', noun: 'character', run: scoreAllCharactersForUser },
  events: { label: 'event significance', noun: 'event', run: scoreAllEventsForUser },
  relationships: { label: 'relationship', noun: 'relationship', run: scoreAllRelationshipsForUser },
};

export function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function resolveUserId(argv: string[]): Promise<string> {
  const userId = arg(argv, '--user-id');
  if (userId) return userId;

  const email = arg(argv, '--user');
  if (!email) throw new Error('Provide --user <email> or --user-id <uuid>');

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.id;
}

/** Run one or all scoring backfills. argv = process.argv.slice(2). */
export async function runBackfill(argv: string[]): Promise<void> {
  const sub = argv[0] as Target | 'all' | undefined;
  if (!sub || (sub !== 'all' && !(sub in SCORERS))) {
    throw new Error('Usage: backfill-scores.ts <characters|events|relationships|all> --user <email>');
  }

  const userId = await resolveUserId(argv);
  const targets: Target[] = sub === 'all' ? (Object.keys(SCORERS) as Target[]) : [sub];

  for (const target of targets) {
    const { label, noun, run } = SCORERS[target];
    console.log(`Scoring ${label} for user ${userId}...`);
    const { scored } = await run(userId);
    console.log(`Done. Scored ${scored} ${noun}(s).`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runBackfill(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

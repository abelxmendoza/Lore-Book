#!/usr/bin/env tsx
/**
 * Re-check every thread/conversation for a user and relearn group signals.
 *
 * 1. Rebuilds the character identity index from the Character Book.
 * 2. Re-scans all conversations (grouped by session) for co-occurrence + named
 *    groups, so people talked about together in the same conversation cluster.
 *
 * Usage:
 *   npx tsx scripts/reprocess-groups.ts                       # admin user, 365d
 *   npx tsx scripts/reprocess-groups.ts --user <email>
 *   npx tsx scripts/reprocess-groups.ts --days 730 --cap 1000
 */
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { characterIdentityIndexService } from '../apps/server/src/services/characterIdentityIndexService';
import { groupDetectionWorker } from '../apps/server/src/workers/groupDetectionWorker';
import { groupCandidateService } from '../apps/server/src/services/groupCandidateService';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveUserId(email?: string): Promise<string> {
  if (!email) return process.env.ADMIN_USER_ID ?? '789bd607-e063-466f-a9ef-f68d24e8bb57';
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

async function main() {
  const userId = await resolveUserId(arg('--user'));
  const days = Number(arg('--days') ?? 365);
  const cap = Number(arg('--cap') ?? 1000);

  console.log(`Reprocessing groups for user ${userId} (days=${days}, cap=${cap})`);

  const index = await characterIdentityIndexService.rebuild(userId);
  console.log(`  identity index rebuilt: ${index.indexed} mention rows`);

  await groupDetectionWorker.runForUser(userId, days, cap);
  console.log('  conversation + journal re-scan complete');

  const pending = await groupCandidateService.getCandidates(userId, 'pending');
  console.log(`\nPending candidates now surfacing (${pending.length}):`);
  for (const c of pending) {
    console.log(`  • ${c.proposed_name ?? '(unnamed)'} :: ${(c.detected_members ?? []).join(', ')} ` +
      `[${c.suggested_group_type}] occ=${c.occurrence_count} conf=${c.confidence.toFixed(2)}`);
  }

  const { data: all } = await supabase
    .from('group_candidates')
    .select('proposed_name, detected_members, occurrence_count, confidence, status')
    .eq('user_id', userId)
    .order('occurrence_count', { ascending: false });
  console.log(`\nAll candidates in DB (${all?.length ?? 0}):`);
  for (const c of (all ?? []) as any[]) {
    console.log(`  • ${c.proposed_name ?? '(unnamed)'} :: ${(c.detected_members ?? []).join(', ')} ` +
      `occ=${c.occurrence_count} conf=${Number(c.confidence).toFixed(2)} [${c.status}]`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

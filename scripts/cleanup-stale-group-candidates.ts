#!/usr/bin/env tsx
/**
 * Reject or delete stale/polluted group suggestions created by old mock/test data.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-stale-group-candidates.ts --user <email>
 *   pnpm tsx scripts/cleanup-stale-group-candidates.ts --user <email> --execute
 *   pnpm tsx scripts/cleanup-stale-group-candidates.ts --user <email> --execute --delete
 *
 * Dry-run by default. Without --delete, rows are marked rejected.
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

const POLLUTED = /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock|san diego|of debt)\b/i;
const BAD_MEMBERS = new Set(['Had', 'Do', 'Did', 'Just', 'She', 'He', 'They', 'My', 'From', 'The', 'This', 'That', 'San Diego', 'Smith Rock']);

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

function isPolluted(candidate: Record<string, any>): boolean {
  const members = Array.isArray(candidate.detected_members) ? candidate.detected_members : [];
  const combined = [
    candidate.proposed_name,
    candidate.context,
    ...members,
  ].filter(Boolean).join(' ');

  if (POLLUTED.test(combined)) return true;
  if (members.some(member => BAD_MEMBERS.has(String(member)))) return true;
  if (candidate.proposed_name && /^(?:of|in|on|at|to|from|with|for)\s+/i.test(candidate.proposed_name)) return true;
  return false;
}

async function main() {
  const email = arg('--user');
  const execute = process.argv.includes('--execute');
  const hardDelete = process.argv.includes('--delete');

  if (!email) {
    console.error('Usage: cleanup-stale-group-candidates.ts --user <email> [--execute] [--delete]');
    process.exit(1);
  }

  const userId = await resolveUserId(email);
  const { data, error } = await supabase
    .from('group_candidates')
    .select('id, proposed_name, detected_members, context, confidence, occurrence_count, status')
    .eq('user_id', userId);
  if (error) throw error;

  const matches = (data ?? []).filter(isPolluted);
  console.log(`${execute ? 'EXECUTING' : 'DRY RUN'} — ${matches.length} stale group candidates matched for ${email}`);
  for (const candidate of matches) {
    console.log(`- ${candidate.proposed_name ?? '(unnamed)'} :: ${(candidate.detected_members ?? []).join(', ')} [${candidate.id}]`);
  }

  if (!execute || matches.length === 0) return;

  const ids = matches.map(candidate => candidate.id);
  const result = hardDelete
    ? await supabase.from('group_candidates').delete().in('id', ids).eq('user_id', userId).select('id')
    : await supabase.from('group_candidates').update({ status: 'rejected', updated_at: new Date().toISOString() }).in('id', ids).eq('user_id', userId).select('id');

  if (result.error) throw result.error;
  console.log(`${hardDelete ? 'Deleted' : 'Rejected'} ${result.data?.length ?? 0} stale candidates.`);
}

main().catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});

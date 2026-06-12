#!/usr/bin/env tsx
/**
 * Rename events with missing or generic titles ("Untitled Event", "Activity",
 * "Life update", …) using their own context: event summary, then the source
 * journal entry content, then participant names.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-event-titles.ts --user <email>            # dry run
 *   pnpm tsx scripts/backfill-event-titles.ts --user <email> --execute
 */

import { ruleBasedTitleGenerationService } from '../apps/server/src/services/ruleBasedTitleGeneration';
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';

const GENERIC_TITLES = new Set([
  'untitled event', 'untitled', 'activity', 'life update', 'career event',
  'living situation', 'relationship update', 'romantic conflict',
]);

const isGeneric = (title: string | null | undefined) =>
  !title || title.trim().length === 0 || GENERIC_TITLES.has(title.trim().toLowerCase());

function parseArgs() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--user');
  const user = i >= 0 ? argv[i + 1] : undefined;
  if (!user) {
    console.error('Usage: backfill-event-titles.ts --user <email> [--execute]');
    process.exit(1);
  }
  return { user, execute: argv.includes('--execute') };
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No auth user found for email ${email}`);
    process.exit(1);
  }
  return user.id;
}

async function main() {
  const { user, execute } = parseArgs();
  const userId = await resolveUserId(user);

  const { data: events, error } = await supabase
    .from('resolved_events')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  // People names for "<…> with <names>" context
  const { data: omega } = await supabase
    .from('omega_entities')
    .select('id, primary_name')
    .eq('user_id', userId);
  const nameById = new Map((omega ?? []).map(e => [e.id, e.primary_name]));

  let renamed = 0;
  for (const ev of (events ?? []) as Array<Record<string, any>>) {
    const currentTitle = (ev.event_title ?? ev.title ?? null) as string | null;
    if (!isGeneric(currentTitle)) continue;

    // Context: event summary → source journal entry content
    let source = (ev.event_summary ?? ev.summary ?? '') as string;
    if (source.trim().length < 20 && ev.source_entry_id) {
      const { data: entry } = await supabase
        .from('journal_entries')
        .select('content, summary')
        .eq('id', ev.source_entry_id)
        .single();
      source = entry?.summary ?? entry?.content ?? source;
    }

    let newTitle = '';
    if (source.trim().length > 0) {
      newTitle = ruleBasedTitleGenerationService.generateTitle(source);
    }
    if (isGeneric(newTitle) || newTitle.length < 8) {
      const people = ((ev.people ?? []) as string[])
        .map(p => nameById.get(p))
        .filter(Boolean)
        .slice(0, 3);
      if (people.length > 0) {
        const base = currentTitle && !/untitled/i.test(currentTitle) ? currentTitle : 'Time';
        newTitle = `${base} with ${people.join(', ')}`;
      }
    }
    if (isGeneric(newTitle) || newTitle.length < 8) {
      const when = ev.start_time ?? ev.created_at;
      newTitle = `Event on ${new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    console.log(`  "${currentTitle ?? '(null)'}" → "${newTitle}" [${ev.id}]`);
    renamed++;

    if (execute) {
      const patch: Record<string, string> = {};
      if ('event_title' in ev) patch.event_title = newTitle;
      if ('title' in ev) patch.title = newTitle;
      const { error: upErr } = await supabase
        .from('resolved_events')
        .update(patch)
        .eq('id', ev.id)
        .eq('user_id', userId);
      if (upErr) console.error(`    failed: ${upErr.message}`);
    }
  }

  console.log(`\n${renamed} event(s) ${execute ? 'renamed' : 'would be renamed (dry run — pass --execute to apply)'}.`);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

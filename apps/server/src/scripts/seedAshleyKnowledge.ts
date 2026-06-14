#!/usr/bin/env tsx
/**
 * Ensure Ashley De La Cruz has complete structured lore for recall.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/seedAshleyKnowledge.ts
 *   cd apps/server && npx tsx src/scripts/seedAshleyKnowledge.ts --user-id <uuid>
 */

import 'dotenv/config';
import { supabaseAdmin } from '../services/supabaseClient';

const DEFAULT_USER = '789bd607-e063-466f-a9ef-f68d24e8bb57';
const ASHLEY_NAME = 'Ashley De La Cruz';

const CANONICAL_FACTS: Array<{ fact: string; category: string; confidence: number }> = [
  { fact: 'Last name is De La Cruz', category: 'general', confidence: 0.99 },
  { fact: 'Was 19', category: 'general', confidence: 0.95 },
  { fact: 'Met the narrator after Club Metro in DTLA', category: 'relationship', confidence: 0.9 },
  { fact: 'Spent the night together', category: 'relationship', confidence: 0.92 },
  { fact: 'Relationship did not continue', category: 'relationship', confidence: 0.85 },
];

async function main() {
  const userIdx = process.argv.indexOf('--user-id');
  const userId = userIdx >= 0 ? process.argv[userIdx + 1] : DEFAULT_USER;

  const { data: char, error: charErr } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias')
    .eq('user_id', userId)
    .ilike('name', ASHLEY_NAME)
    .maybeSingle();

  if (charErr) throw charErr;
  if (!char) {
    console.error(`No character "${ASHLEY_NAME}" for user ${userId}`);
    process.exit(1);
  }

  const { data: existingFacts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, fact')
    .eq('user_id', userId)
    .eq('entity_id', char.id)
    .eq('entity_type', 'character')
    .eq('status', 'active');

  const existingSet = new Set((existingFacts ?? []).map((f) => f.fact.toLowerCase()));
  const now = new Date().toISOString();
  let inserted = 0;

  for (const incoming of CANONICAL_FACTS) {
    const dup = [...existingSet].some(
      (e) => e.includes(incoming.fact.toLowerCase()) || incoming.fact.toLowerCase().includes(e)
    );
    if (dup) continue;

    const { error } = await supabaseAdmin.from('entity_facts').insert({
      user_id: userId,
      entity_id: char.id,
      entity_type: 'character',
      fact: incoming.fact,
      category: incoming.category,
      confidence: incoming.confidence,
      mention_count: 1,
      status: 'active',
      first_seen_at: now,
      last_confirmed_at: now,
    });
    if (error) throw error;
    inserted += 1;
    existingSet.add(incoming.fact.toLowerCase());
  }

  const { data: existingRom } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('person_id', char.id)
    .eq('person_type', 'character')
    .maybeSingle();

  if (!existingRom) {
    const { error } = await supabaseAdmin.from('romantic_relationships').insert({
      user_id: userId,
      person_id: char.id,
      person_type: 'character',
      relationship_type: 'one_night_stand',
      status: 'ended',
      is_current: false,
      metadata: {
        summary: 'Met after Club Metro in DTLA; spent the night together; did not continue',
        meeting_place: 'Club Metro, DTLA',
      },
    });
    if (error) throw error;
    console.log('Created romantic_relationship for Ashley');
  } else {
    const meta = (existingRom.metadata as Record<string, unknown>) ?? {};
    const { error } = await supabaseAdmin
      .from('romantic_relationships')
      .update({
        metadata: {
          ...meta,
          summary: 'Met after Club Metro in DTLA; spent the night together; did not continue',
          meeting_place: 'Club Metro, DTLA',
        },
        updated_at: now,
      })
      .eq('id', existingRom.id);
    if (error) throw error;
    console.log('Updated romantic_relationship metadata for Ashley');
  }

  // Ensure alias includes "Ashley"
  const aliases = char.alias ?? [];
  if (!aliases.some((a: string) => a.toLowerCase() === 'ashley')) {
    await supabaseAdmin
      .from('characters')
      .update({ alias: [...aliases, 'Ashley'], updated_at: now })
      .eq('id', char.id);
  }

  console.log(`Ashley knowledge seeded for ${char.name} (${char.id}): ${inserted} new fact(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

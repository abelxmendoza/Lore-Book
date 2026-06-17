#!/usr/bin/env tsx
/**
 * Seed structured character knowledge from a LOCAL facts file (never committed).
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/seedAshleyKnowledge.ts --user-id <uuid> --facts-file ../../.private/seeds/character-knowledge.json
 *
 * The facts file stays in .private/ (gitignored). Never commit real personal lore to the repo.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import 'dotenv/config';
import { supabaseAdmin } from '../services/supabaseClient';

type SeedFactsFile = {
  characterName: string;
  facts: Array<{ fact: string; category: string; confidence: number }>;
};

async function main() {
  const userIdx = process.argv.indexOf('--user-id');
  const factsIdx = process.argv.indexOf('--facts-file');
  const userId = userIdx >= 0 ? process.argv[userIdx + 1] : '';
  const factsPath = factsIdx >= 0 ? process.argv[factsIdx + 1] : '';

  if (!userId || !factsPath) {
    console.error('Required: --user-id <uuid> --facts-file <path-to-json>');
    console.error('Example facts file: .private/seeds/character-knowledge.json (gitignored)');
    process.exit(1);
  }

  const seed: SeedFactsFile = JSON.parse(readFileSync(resolve(factsPath), 'utf8'));
  const characterName = seed.characterName;

  const { data: char, error: charErr } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias')
    .eq('user_id', userId)
    .ilike('name', characterName)
    .maybeSingle();

  if (charErr) throw charErr;
  if (!char) {
    console.error(`No character "${characterName}" for user ${userId}`);
    process.exit(1);
  }

  const { data: existingFacts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, fact')
    .eq('user_id', userId)
    .eq('entity_id', char.id)
    .eq('entity_type', 'character');

  const existingSet = new Set((existingFacts ?? []).map((f) => f.fact.toLowerCase()));
  let inserted = 0;

  for (const item of seed.facts) {
    if (existingSet.has(item.fact.toLowerCase())) continue;
    const { error } = await supabaseAdmin.from('entity_facts').insert({
      user_id: userId,
      entity_id: char.id,
      entity_type: 'character',
      fact: item.fact,
      category: item.category,
      confidence: item.confidence,
      source: 'seed_script',
    });
    if (error) throw error;
    inserted++;
  }

  console.log(`Seeded ${inserted} facts for "${characterName}" (${char.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

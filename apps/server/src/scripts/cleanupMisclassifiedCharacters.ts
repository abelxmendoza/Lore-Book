/**
 * Remove misclassified character cards (holidays, events, game fragments)
 * and redistribute their facts into the omega graph.
 *
 * Usage:
 *   npx tsx src/scripts/cleanupMisclassifiedCharacters.ts [--dry-run] [--name "Memorial Day"]
 */

import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { characterDeletionService } from '../services/characterDeletionService';
import { supabaseAdmin } from '../services/supabaseClient';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nameIdx = args.indexOf('--name');
const nameFilter = nameIdx >= 0 ? args[nameIdx + 1]?.toLowerCase() : null;
const userIdx = args.indexOf('--user');
const userFilter = userIdx >= 0 ? args[userIdx + 1] : null;

async function main() {
  let query = supabaseAdmin.from('characters').select('id, user_id, name, metadata');
  if (userFilter) query = query.eq('user_id', userFilter);

  const { data: characters, error } = await query.limit(500);
  if (error) throw error;

  const targets = (characters ?? []).filter((c) => {
    if (nameFilter && !c.name.toLowerCase().includes(nameFilter)) return false;
    return classifyMentionKind(c.name).kind !== 'person';
  });

  if (targets.length === 0) {
    console.log('No misclassified character cards found.');
    return;
  }

  console.log(`Found ${targets.length} misclassified character(s):`);
  for (const c of targets) {
    const kind = classifyMentionKind(c.name).kind;
    console.log(`  - ${c.name} (${kind}) [${c.id}] user=${c.user_id}`);
  }

  if (dryRun) {
    console.log('\nDry run — no deletions performed.');
    return;
  }

  for (const c of targets) {
    const report = await characterDeletionService.deleteCharacter(c.user_id, c.id, {
      redistribute: true,
    });
    console.log(`Deleted "${c.name}":`, report?.redistribution);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

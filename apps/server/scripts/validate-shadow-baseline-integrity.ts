/**
 * Sprint P validation: prove the readiness report now refuses to launder
 * degenerate (empty-baseline) samples as measured quality.
 *
 * Read-only — calls the real `shadowModeOrchestrator.getReadinessReport()`
 * against the live `shadow_extraction_log` table. Does not write anything.
 *
 * Usage: npx tsx scripts/validate-shadow-baseline-integrity.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

import { shadowModeOrchestrator } from '../src/services/ingestion/shadowMode';
import { supabaseAdmin } from '../src/services/supabaseClient';

async function main() {
  console.log('=== Sprint P: shadow baseline integrity — AFTER fix ===\n');

  for (const target of [50, 100, 200] as const) {
    const report = await shadowModeOrchestrator.getReadinessReport(target);
    console.log(`getReadinessReport(${target}):`);
    console.log(`  sample_count=${report.sample_count}  valid=${report.valid_sample_count}  invalid=${report.invalid_sample_count}  baseline_valid=${report.baseline_valid}  ready_for_ab=${report.ready_for_ab}`);
    console.log(`  hard_blocks: ${JSON.stringify(report.hard_blocks)}`);
    if (report.not_comparable.length) console.log(`  not_comparable: ${JSON.stringify(report.not_comparable)}`);
    console.log('');
  }

  console.log('=== Raw row inspection: degenerate vs trustworthy baseline shape ===\n');
  const { data } = await supabaseAdmin
    .from('shadow_extraction_log')
    .select('id, created_at, baseline_entities, merged_extraction, entity_precision, entity_recall, entity_f1')
    .order('created_at', { ascending: false })
    .limit(3);

  for (const row of data || []) {
    const mergedEntityCount = (row as any).merged_extraction?.entities?.length ?? 0;
    console.log(`row ${row.id} (${row.created_at})`);
    console.log(`  baseline_entities=${JSON.stringify((row as any).baseline_entities)} (len=${(row as any).baseline_entities?.length ?? 0})`);
    console.log(`  merged found ${mergedEntityCount} entities`);
    console.log(`  recorded entity_precision=${row.entity_precision} recall=${row.entity_recall} f1=${row.entity_f1}`);
    console.log(`  --> ${(row as any).baseline_entities?.length === 0 && mergedEntityCount > 0
      ? 'DEGENERATE: empty baseline vs non-empty merged output -> trivial {1,1,1} (pre-fix capture bug)'
      : 'shape looks consistent'}`);
    console.log('');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

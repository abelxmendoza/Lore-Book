/**
 * Run the Revealed Preference Engine against a real account and print the result.
 *   npx tsx scripts/run-revealed-preference.ts <userId>
 */
import { revealedPreferenceService } from '../src/services/revealedPreference/revealedPreferenceService';

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error('Usage: tsx scripts/run-revealed-preference.ts <userId>');

  const summary = await revealedPreferenceService.rescan(userId);
  const report = await revealedPreferenceService.getRevealedSelf(userId);

  console.log('\n=== RESCAN SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n=== REVEALED SELF — per category (evidence-backed) ===');
  const rows = report.categories
    .slice()
    .sort((a, b) => b.revealedCount - a.revealedCount)
    .map((c) => ({
      category: c.label,
      type: c.type,
      stated: c.statedCount,
      revealed: c.revealedCount,
      confidence: c.confidence,
      alignment: c.alignmentLabel,
      trend: c.trend,
    }));
  console.table(rows);

  console.log('\n=== SECTIONS ===');
  console.log(JSON.stringify(report.sections, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

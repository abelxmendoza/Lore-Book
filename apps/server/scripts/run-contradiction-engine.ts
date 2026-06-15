/**
 * Run the Contradiction Engine against a real account.
 *   npx tsx scripts/run-contradiction-engine.ts <userId>
 */
import { contradictionEngine } from '../src/services/contradiction/contradictionEngine';

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error('Usage: tsx scripts/run-contradiction-engine.ts <userId>');

  const summary = await contradictionEngine.detect(userId);
  const report = await contradictionEngine.getReport(userId);
  const candidates = await contradictionEngine.getEpiphanyCandidates(userId);

  console.log('\n=== DETECT SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n=== PER-CATEGORY ASSESSMENT (Phase 7) ===');
  console.table(report.assessments.map((a) => ({
    category: a.label, type: a.type, stated: a.statedCount, revealed: a.revealedCount,
    status: a.status, confidence: a.confidence,
  })));

  console.log('\n=== CONTRADICTIONS (open) ===');
  for (const c of report.contradictions.filter((x) => x.status === 'open')) {
    console.log(`\n[${c.section}/${c.severity}] ${c.label} (${c.type}) conf=${c.confidence} evidence=${c.evidenceCount}`);
    console.log(`  ${c.detail}`);
    for (const e of c.evidence.slice(0, 2)) console.log(`   • (${e.side}/${e.source}) "${e.snippet}"`);
  }

  console.log('\n=== EPIPHANY CANDIDATES (Phase 6) ===');
  console.log(JSON.stringify(candidates, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

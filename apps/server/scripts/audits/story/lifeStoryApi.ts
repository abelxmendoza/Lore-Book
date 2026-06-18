#!/usr/bin/env tsx
/**
 * Life Story API validation — founder + developer accounts.
 *
 * Run:
 *   npx tsx apps/server/scripts/lifeStoryApiAudit.ts
 */
import {
  lifeStoryApiService,
  clearLifeStoryCache,
} from '../../../src/services/lifeStoryApiService';
import { resolveAccount } from '../../lib/auditCommon';

async function validateAccount(label: string, userId: string) {
  clearLifeStoryCache(userId);
  const [arcs, chapter, conflicts, momentum] = await Promise.all([
    lifeStoryApiService.getLifeArcsResponse(userId),
    lifeStoryApiService.getCurrentChapterResponse(userId),
    lifeStoryApiService.getLifeConflictsResponse(userId),
    lifeStoryApiService.getLifeMomentumResponse(userId),
  ]);

  console.log(`\n========== ${label} ==========`);
  console.log(`  Arcs: ${arcs.arcs.length} (provenance avg evidence: ${
    arcs.arcs.length
      ? (arcs.arcs.reduce((s, a) => s + a.provenance.evidenceCount, 0) / arcs.arcs.length).toFixed(1)
      : '0'
  })`);
  console.log(`  Chapter: ${chapter.chapter.narrative.slice(0, 80)}…`);
  console.log(`  Chapter confidence: ${chapter.chapter.provenance.confidence.toFixed(2)}`);
  console.log(`  Conflicts: ${conflicts.conflicts.length}`);
  console.log(`  Momentum: growing=${momentum.summary.growing} emerging=${momentum.summary.emerging}`);

  const tsConsistent =
    arcs.generatedAt === chapter.generatedAt &&
    arcs.generatedAt === conflicts.generatedAt &&
    arcs.generatedAt === momentum.generatedAt;
  console.log(`  Timestamp consistency: ${tsConsistent ? 'OK' : 'MISMATCH'}`);

  return {
    arcCount: arcs.arcs.length,
    conflictCount: conflicts.conflicts.length,
    chapterSnippet: chapter.chapter.narrative.slice(0, 60),
    tsConsistent,
  };
}

export async function runLifeStoryApiAudit(): Promise<void> {
  console.log('\n=== Life Story API Audit ===\n');

  const founder = await resolveAccount('founder');
  if (!founder) throw new Error('Founder account not found');

  const founderResult = await validateAccount(`founder (${founder.email})`, founder.id);

  const developer = await resolveAccount('developer');
  let developerResult: Awaited<ReturnType<typeof validateAccount>> | null = null;
  if (developer) {
    developerResult = await validateAccount(`developer (${developer.email})`, developer.id);
    console.log('\n--- Cross-account ---');
    console.log(`  Founder arcs: ${founderResult.arcCount} | Developer arcs: ${developerResult.arcCount}`);
    console.log(`  Founder conflicts: ${founderResult.conflictCount} | Developer: ${developerResult.conflictCount}`);
  } else {
    console.log('\n--- Cross-account ---');
    console.log('  Developer account not in auth — skipped');
  }

  console.log('\n--- Verdict ---');
  console.log(`  Founder API: ${founderResult.tsConsistent && founderResult.arcCount > 0 ? 'PASS' : 'PARTIAL'}`);
  if (developerResult) {
    console.log(`  Developer API: ${developerResult.tsConsistent ? 'PASS' : 'PARTIAL'}`);
  }
  console.log('');
}

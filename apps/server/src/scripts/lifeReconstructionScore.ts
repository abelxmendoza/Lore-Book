#!/usr/bin/env tsx
/**
 * Life reconstruction trust scorecard.
 * Run: RECOVERY_USER_ID=<uuid> npx tsx apps/server/src/scripts/lifeReconstructionScore.ts
 */
import { assembleWorkingMemory } from '../services/chat/workingMemoryAssembler';
import { buildMemoryCoverageAudit } from '../services/diagnostics/memoryCoverageAudit';
import { eventRecoveryService } from '../services/eventRecoveryService';
import { relationshipFoundationService } from '../services/relationshipFoundationService';
import { supabaseAdmin } from '../services/supabaseClient';

const USER_ID =
  process.env.RECOVERY_USER_ID ?? process.env.TARGET_USER_ID ?? '';

const RECALL_QUERIES = [
  'Who lives with me?',
  'What happened with Sol?',
  'What did I do with Abuela?',
  'Who is Andrew?',
  'What role did Kelly play?',
  'How am I related to Tio Juan?',
  "What happened at Leslie's Graduation Party?",
];

const FAMILY_BENCHMARK = ['Mom', 'Step Dad Ben', 'Abuela', 'Juan', 'Grace', 'Ralph', 'Leslie', 'James', 'Jerry'];
const TIMELINE_BENCHMARK = [
  'costco_abuela',
  'lorebook_abuela_house',
  'club_metro',
  'leslie_graduation',
  'kelly_interview',
  'amazon_onboarding',
  'sol_breakup',
];

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

async function threadContinuityScore(userId: string): Promise<number> {
  const { data: threads } = await supabaseAdmin
    .from('conversation_sessions')
    .select('metadata')
    .eq('user_id', userId)
    .limit(50);

  if (!threads?.length) return 0;
  let withSummary = 0;
  let withMessages = 0;
  for (const t of threads) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const tm = (meta.threadMeta ?? meta) as Record<string, unknown>;
    const hasSummary = !!(tm.summary_short || tm.summary_medium || tm.summary_long || tm.summary);
    const msgCount = Number(tm.message_count ?? (Array.isArray(meta.messages) ? meta.messages.length : 0));
    if (hasSummary) withSummary++;
    if (msgCount > 0) withMessages++;
  }
  const summaryRate = pct(withSummary, threads.length);
  const messageRate = pct(withMessages, threads.length);
  return Math.round(summaryRate * 0.6 + messageRate * 0.4);
}

async function recallScore(userId: string): Promise<{ score: number; details: Record<string, boolean> }> {
  const details: Record<string, boolean> = {};
  let hits = 0;

  for (const q of RECALL_QUERIES) {
    const assembly = await assembleWorkingMemory({ question: q, userId });
    const blob = [
      ...assembly.episodes,
      ...assembly.events,
      ...assembly.timeline,
      ...assembly.relationships,
      ...assembly.entities,
    ]
      .map((i) => `${i.title} ${i.content}`.toLowerCase())
      .join(' ');

    const ql = q.toLowerCase();
    let ok = assembly.confidence >= 0.35 && assembly.relationships.length + assembly.events.length + assembly.entities.length > 0;

    if (/who lives with me/.test(ql)) ok = ok && /mom|james|jerry|leslie|grace|household|family|ben/i.test(blob);
    if (/sol/.test(ql)) ok = ok && /sol|romantic|breakup|blocked|no contact/i.test(blob);
    if (/abuela/.test(ql)) ok = ok && /abuela|grandmother|costco|lorebook/i.test(blob);
    if (/andrew/.test(ql)) ok = ok && /andrew|friend|club|bar/i.test(blob);
    if (/kelly/.test(ql)) ok = ok && /kelly|recruiter|interview|coworker|amazon/i.test(blob);
    if (/tio juan|tío juan/.test(ql)) ok = ok && /juan|uncle|family|t[íi]o/i.test(blob);
    if (/leslie.*graduation|graduation party/.test(ql)) ok = ok && /leslie|graduation|party/i.test(blob);

    details[q] = ok;
    if (ok) hits++;
  }

  return { score: pct(hits, RECALL_QUERIES.length), details };
}

async function main() {
  console.log('=== LIFE RECONSTRUCTION SCORECARD ===');
  console.log('userId:', USER_ID);

  const audit = await buildMemoryCoverageAudit(USER_ID);
  const coverage = await relationshipFoundationService.buildCoverageReport(USER_ID);
  const timelineBench = await eventRecoveryService.benchmarkCoverage(USER_ID);
  const recall = await recallScore(USER_ID);
  const threadCont = await threadContinuityScore(USER_ID);

  const memoryAccuracy = audit.summary.averageCoverageScore;
  const entityAccuracy = pct(
    audit.entities.filter((e) => e.type === 'character' && e.coverageScore >= 40).length,
    audit.entities.filter((e) => e.type === 'character').length || 1
  );

  const familyHits = Object.values(coverage.familyBenchmark).filter(Boolean).length;
  const socialHits = Object.values(coverage.socialBenchmark).filter(Boolean).length;
  const careerHits = Object.values(coverage.careerBenchmark).filter(Boolean).length;
  const romanticHits = Object.values(coverage.romanticBenchmark).filter(Boolean).length;
  const relDenom =
    Object.keys(coverage.familyBenchmark).length +
    Object.keys(coverage.socialBenchmark).length +
    Object.keys(coverage.careerBenchmark).length +
    Object.keys(coverage.romanticBenchmark).length;
  const relHits = familyHits + socialHits + careerHits + romanticHits;
  const relationshipAccuracy = pct(relHits, relDenom);

  const timelineHits = TIMELINE_BENCHMARK.filter((k) => timelineBench[k]).length;
  const timelineAccuracy = pct(timelineHits, TIMELINE_BENCHMARK.length);

  const recallAccuracy = recall.score;
  const threadContinuity = threadCont;

  const overall = Math.round(
    memoryAccuracy * 0.15 +
      entityAccuracy * 0.15 +
      relationshipAccuracy * 0.25 +
      timelineAccuracy * 0.2 +
      recallAccuracy * 0.15 +
      threadContinuity * 0.1
  );

  const scorecard = {
    overall,
    memoryAccuracy,
    entityAccuracy,
    relationshipAccuracy,
    timelineAccuracy,
    recallAccuracy,
    threadContinuity,
    relationshipCount: coverage.relationshipCount,
    timelineBenchmark: timelineBench,
    recallDetails: recall.details,
    familyBenchmark: coverage.familyBenchmark,
  };

  console.log(JSON.stringify(scorecard, null, 2));
  console.log('\nVERDICT:', overall >= 60 ? 'YES — significant improvement' : overall >= 45 ? 'PARTIAL — improved but below target' : 'NO — still weak');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

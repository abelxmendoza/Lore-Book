#!/usr/bin/env tsx
/**
 * Episode Quality & Reconstruction Validation Sprint.
 *
 * Run:
 *   npx tsx apps/server/scripts/episodeQualityValidation.ts
 *
 * Requires OWNER_EMAIL + DEVELOPER_EMAIL (or OWNER_USER_ID + DEVELOPER_USER_ID) in .env.
 * Never hardcodes user UUIDs.
 */
import { assembleWorkingMemory } from '../src/services/chat/workingMemoryAssembler';
import { buildMemoryCoverageAudit } from '../src/services/diagnostics/memoryCoverageAudit';
import { buildContinuityCard, emptyThreadMetadata } from '../src/services/conversationCentered/threadIntelligenceService';
import { episodeSegmentationTrigger } from '../src/services/conversationCentered/episodeSegmentationTrigger';
import { loadEpisodeStats, type EpisodeRow } from '../src/services/conversationCentered/episodePersistenceService';
import { eventRecoveryService } from '../src/services/eventRecoveryService';
import { relationshipFoundationService } from '../src/services/relationshipFoundationService';
import { supabaseAdmin } from '../src/services/supabaseClient';
import { config } from '../src/config';

const SAMPLE_SIZE = Number(process.env.EPISODE_SAMPLE_SIZE ?? 50);

/** Pre-episode baseline from docs/trust-scorecard.md (2026-06-15, before activation). */
const BASELINE_SCORECARD = {
  overall: 66,
  memoryAccuracy: 32,
  entityAccuracy: 18,
  relationshipAccuracy: 79,
  timelineAccuracy: 100,
  recallAccuracy: 100,
  threadContinuity: 40,
};

const RECALL_QUERIES = [
  'Who lives with me?',
  'What happened with Sol?',
  'What did I do with Abuela?',
  'Who is Andrew?',
  'What role did Kelly play?',
  'How am I related to Tio Juan?',
  "What happened at Leslie's Graduation Party?",
];

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

async function resolveUserId(label: string, email?: string, id?: string): Promise<string | null> {
  if (id?.trim()) return id.trim();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  if (email?.trim()) {
    const match = data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (match) return match.id;
  }

  const roleTarget = label === 'founder' ? 'admin' : 'developer';
  const byRole = data.users.find((u) => {
    const appRole = String(u.app_metadata?.role ?? u.user_metadata?.role ?? '').toLowerCase();
    if (label === 'founder') {
      return appRole === 'owner' || appRole === 'admin' || u.id === config.ownerUserId;
    }
    return appRole === roleTarget;
  });
  return byRole?.id ?? null;
}

async function threadsForUser(userId: string): Promise<string[]> {
  const [{ data: chatMsgs }, { data: sessions }] = await Promise.all([
    supabaseAdmin.from('chat_messages').select('session_id').eq('user_id', userId),
    supabaseAdmin.from('conversation_sessions').select('id').eq('user_id', userId),
  ]);
  return [...new Set([...(chatMsgs ?? []).map((m) => m.session_id), ...(sessions ?? []).map((s) => s.id)])];
}

async function relationshipIdsForEntities(userId: string, entityIds: string[]): Promise<string[]> {
  if (entityIds.length === 0) return [];
  const set = new Set(entityIds);
  const { data } = await supabaseAdmin
    .from('character_relationships')
    .select('id, source_character_id, target_character_id')
    .eq('user_id', userId);
  return (data ?? [])
    .filter((r) => set.has(r.source_character_id) || set.has(r.target_character_id))
    .map((r) => r.id);
}

interface EpisodeQualityScore {
  id: string;
  title: string;
  titleScore: number;
  boundaryScore: number;
  entityScore: number;
  eventScore: number;
  duplicateTitle: boolean;
  confidence: number;
  msgCount: number;
  entityCount: number;
  eventCount: number;
  relationshipCount: number;
  boundaryReason: string;
}

function scoreTitle(title: string, boundaryReason: string): number {
  if (!title?.trim()) return 0;
  if (title === 'Thread start' && boundaryReason === 'thread-start') return 70;
  if (/Episode \d+/.test(title) && !title.includes('·')) return 35;
  if (title.includes('·') || title.includes(' & ')) return 85;
  if (/gap|shift|entity|location|topic/.test(title.toLowerCase())) return 55;
  return 72;
}

function scoreBoundary(reason: string, msgCount: number): number {
  if (msgCount <= 0) return 0;
  if (msgCount === 1 && reason === 'thread-start') return 90;
  if (reason.includes('time-gap')) return 85;
  if (reason.includes('entity-shift') || reason.includes('location-shift')) return 80;
  if (reason.includes('topic-shift')) return 70;
  if (msgCount > 80) return 40; // under-segmentation signal
  return 75;
}

function scoreEpisode(ep: EpisodeRow, titleCounts: Map<string, number>, relCount: number): EpisodeQualityScore {
  const msgCount = ep.source_message_ids.length;
  const entityCount = ep.source_entity_ids.length;
  const eventCount = ep.source_event_ids.length;
  const titleScore = scoreTitle(ep.title, ep.boundary_reason);
  const boundaryScore = scoreBoundary(ep.boundary_reason, msgCount);
  const entityScore = entityCount > 0 ? Math.min(100, 50 + entityCount * 15) : msgCount > 3 ? 25 : 45;
  const eventScore = eventCount > 0 ? 85 : msgCount > 5 ? 30 : 50;
  const duplicateTitle = (titleCounts.get(ep.title) ?? 0) > 1;
  const confidence = Math.round(
    (titleScore * 0.25 + boundaryScore * 0.25 + entityScore * 0.2 + eventScore * 0.2 + (duplicateTitle ? 0 : 10)) / 1.0
  );

  return {
    id: ep.id,
    title: ep.title,
    titleScore,
    boundaryScore,
    entityScore,
    eventScore,
    duplicateTitle,
    confidence,
    msgCount,
    entityCount,
    eventCount,
    relationshipCount: relCount,
    boundaryReason: ep.boundary_reason,
  };
}

async function recallScore(userId: string) {
  const details: Record<string, boolean> = {};
  let hits = 0;
  let episodeHits = 0;

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
    let ok =
      assembly.confidence >= 0.35 &&
      assembly.relationships.length + assembly.events.length + assembly.entities.length > 0;

    if (/who lives with me/.test(ql)) ok = ok && /mom|james|jerry|leslie|grace|household|family|ben/i.test(blob);
    if (/sol/.test(ql)) ok = ok && /sol|romantic|breakup|blocked|no contact/i.test(blob);
    if (/abuela/.test(ql)) ok = ok && /abuela|grandmother|costco|lorebook/i.test(blob);
    if (/andrew/.test(ql)) ok = ok && /andrew|friend|club|bar/i.test(blob);
    if (/kelly/.test(ql)) ok = ok && /kelly|recruiter|interview|coworker|amazon/i.test(blob);
    if (/tio juan|tío juan/.test(ql)) ok = ok && /juan|uncle|family|t[íi]o/i.test(blob);
    if (/leslie.*graduation|graduation party/.test(ql)) ok = ok && /leslie|graduation|party/i.test(blob);

    details[q] = ok;
    if (ok) hits++;
    if (assembly.episodes.length > 0) episodeHits++;
  }

  return { score: pct(hits, RECALL_QUERIES.length), episodeContextRate: pct(episodeHits, RECALL_QUERIES.length), details };
}

async function threadIntelligenceMetrics(userId: string) {
  const { data: threads } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, metadata')
    .eq('user_id', userId)
    .limit(100);

  let withEpisodes = 0;
  let withSummary = 0;
  let withOpenLoops = 0;
  let totalEpisodeLabels = 0;
  let nonEmptyCards = 0;
  const sampleCards: string[] = [];

  for (const t of threads ?? []) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const tm = { ...emptyThreadMetadata(), ...((meta.threadMeta as object) ?? {}) };
    if (tm.episodes.length > 0) {
      withEpisodes++;
      totalEpisodeLabels += tm.episodes.length;
    }
    if (tm.summary_medium || tm.summary_short) withSummary++;
    if (tm.open_loops.length > 0) withOpenLoops++;
    const card = buildContinuityCard(tm);
    if (card) {
      nonEmptyCards++;
      if (sampleCards.length < 3) sampleCards.push(card.slice(0, 300));
    }
  }

  const threadCount = threads?.length ?? 0;
  return {
    threadCount,
    threadsWithEpisodes: withEpisodes,
    episodeMetaRate: pct(withEpisodes, threadCount),
    avgEpisodeLabelsPerThread: withEpisodes ? Number((totalEpisodeLabels / withEpisodes).toFixed(1)) : 0,
    summaryRate: pct(withSummary, threadCount),
    openLoopRate: pct(withOpenLoops, threadCount),
    continuityCardRate: pct(nonEmptyCards, threadCount),
    sampleCards,
  };
}

async function gapAnalysis(episodes: EpisodeRow[], userId: string) {
  const overSegmented = episodes.filter((e) => e.source_message_ids.length === 1 && e.boundary_reason !== 'thread-start');
  const underSegmented = episodes.filter((e) => e.source_message_ids.length > 40);
  const missingEntities = episodes.filter((e) => e.source_message_ids.length >= 3 && e.source_entity_ids.length === 0);
  const missingEvents = episodes.filter((e) => e.source_message_ids.length >= 5 && e.source_event_ids.length === 0);

  const titleCounts = new Map<string, number>();
  for (const e of episodes) titleCounts.set(e.title, (titleCounts.get(e.title) ?? 0) + 1);
  const duplicateTitles = [...titleCounts.entries()].filter(([, c]) => c > 1);

  const relMissing: string[] = [];
  for (const ep of episodes.slice(0, 30)) {
    if (ep.source_entity_ids.length >= 2) {
      const relIds = await relationshipIdsForEntities(userId, ep.source_entity_ids);
      if (relIds.length === 0) relMissing.push(ep.id);
    }
  }

  return {
    overSegmentation: overSegmented.length,
    underSegmentation: underSegmented.length,
    missingEntityLinks: missingEntities.length,
    missingEventLinks: missingEvents.length,
    duplicateTitleGroups: duplicateTitles.length,
    episodesWithMultiEntityNoRelationship: relMissing.length,
    examples: {
      overSegmented: overSegmented.slice(0, 3).map((e) => ({ title: e.title, msgs: e.source_message_ids.length })),
      underSegmented: underSegmented.slice(0, 3).map((e) => ({ title: e.title, msgs: e.source_message_ids.length })),
      duplicateTitles: duplicateTitles.slice(0, 5).map(([title, count]) => ({ title, count })),
    },
  };
}

async function runCoverage(userId: string, label: string) {
  const threadIds = await threadsForUser(userId);
  let totalEpisodes = 0;
  let totalMessages = 0;
  let totalEntities = 0;
  let totalEvents = 0;
  let totalRelationships = 0;
  const allEpisodes: EpisodeRow[] = [];

  for (const threadId of threadIds) {
    const result = await episodeSegmentationTrigger.runNow(userId, threadId);
    totalEpisodes += result.episodeCount;
    totalMessages += result.messagesTotal;
    for (const ep of result.episodes) {
      allEpisodes.push(ep);
      totalEntities += ep.source_entity_ids.length;
      totalEvents += ep.source_event_ids.length;
      const relIds = await relationshipIdsForEntities(userId, ep.source_entity_ids);
      totalRelationships += relIds.length;
    }
  }

  const stats = await loadEpisodeStats(userId);
  return {
    label,
    userId,
    threadsProcessed: threadIds.length,
    threadsWithEpisodes: allEpisodes.length > 0 ? threadIds.filter((id) => allEpisodes.some((e) => e.source_thread_id === id)).length : 0,
    episodeCount: totalEpisodes,
    avgMessagesPerEpisode: totalEpisodes ? Number((totalMessages / totalEpisodes).toFixed(2)) : 0,
    avgEntitiesPerEpisode: totalEpisodes ? Number((totalEntities / totalEpisodes).toFixed(2)) : 0,
    avgEventsPerEpisode: totalEpisodes ? Number((totalEvents / totalEpisodes).toFixed(2)) : 0,
    avgRelationshipsPerEpisode: totalEpisodes ? Number((totalRelationships / totalEpisodes).toFixed(2)) : 0,
    entityCoveragePct: stats.entityCoveragePct,
    eventCoveragePct: stats.eventCoveragePct,
    episodes: allEpisodes,
  };
}

async function scorecard(userId: string) {
  const audit = await buildMemoryCoverageAudit(userId);
  const coverage = await relationshipFoundationService.buildCoverageReport(userId);
  const timelineBench = await eventRecoveryService.benchmarkCoverage(userId);
  const recall = await recallScore(userId);
  const threadIntel = await threadIntelligenceMetrics(userId);

  const memoryAccuracy = audit.summary.averageCoverageScore;
  const entityAccuracy = pct(
    audit.entities.filter((e) => e.type === 'character' && e.coverageScore >= 40).length,
    audit.entities.filter((e) => e.type === 'character').length || 1
  );

  const relHits =
    Object.values(coverage.familyBenchmark).filter(Boolean).length +
    Object.values(coverage.socialBenchmark).filter(Boolean).length +
    Object.values(coverage.careerBenchmark).filter(Boolean).length +
    Object.values(coverage.romanticBenchmark).filter(Boolean).length;
  const relDenom =
    Object.keys(coverage.familyBenchmark).length +
    Object.keys(coverage.socialBenchmark).length +
    Object.keys(coverage.careerBenchmark).length +
    Object.keys(coverage.romanticBenchmark).length;
  const relationshipAccuracy = pct(relHits, relDenom);

  const timelineHits = TIMELINE_BENCHMARK.filter((k) => timelineBench[k]).length;
  const timelineAccuracy = pct(timelineHits, TIMELINE_BENCHMARK.length);

  const threadContinuity = Math.round(
    threadIntel.continuityCardRate * 0.3 +
      threadIntel.summaryRate * 0.3 +
      threadIntel.episodeMetaRate * 0.4
  );

  const overall = Math.round(
    memoryAccuracy * 0.15 +
      entityAccuracy * 0.15 +
      relationshipAccuracy * 0.25 +
      timelineAccuracy * 0.2 +
      recall.score * 0.15 +
      threadContinuity * 0.1
  );

  return {
    overall,
    memoryAccuracy,
    entityAccuracy,
    relationshipAccuracy,
    timelineAccuracy,
    recallAccuracy: recall.score,
    threadContinuity,
    episodeContextInRecall: recall.episodeContextRate,
    threadIntelligence: threadIntel,
    recallDetails: recall.details,
  };
}

async function main() {
  const founderId = await resolveUserId('founder', config.ownerEmail, config.ownerUserId);
  const developerId = await resolveUserId('developer', config.developerEmail, process.env.DEVELOPER_USER_ID);

  if (!founderId) {
    console.error('Could not resolve founder user — set OWNER_EMAIL, OWNER_USER_ID, or ensure an admin/owner auth user exists');
    process.exit(1);
  }
  if (!developerId) {
    console.error('Could not resolve developer user — set DEVELOPER_EMAIL, DEVELOPER_USER_ID, or ensure a developer auth user exists');
    process.exit(1);
  }

  console.error('Running episode quality validation…');
  console.error(`Founder: ${founderId.slice(0, 8)}… Developer: ${developerId.slice(0, 8)}…`);

  const founderCoverage = await runCoverage(founderId, 'founder');
  const devCoverage = await runCoverage(developerId, 'developer');

  const allEpisodes = [...founderCoverage.episodes, ...devCoverage.episodes];
  const sample = allEpisodes
    .sort((a, b) => b.source_message_ids.length - a.source_message_ids.length)
    .slice(0, SAMPLE_SIZE);

  const titleCounts = new Map<string, number>();
  for (const e of allEpisodes) titleCounts.set(e.title, (titleCounts.get(e.title) ?? 0) + 1);

  const qualityScores: EpisodeQualityScore[] = [];
  for (const ep of sample) {
    const relCount = (await relationshipIdsForEntities(founderCoverage.userId === ep.user_id ? founderId : developerId, ep.source_entity_ids)).length;
    qualityScores.push(scoreEpisode(ep, titleCounts, relCount));
  }

  const avgQuality = {
    title: Math.round(qualityScores.reduce((s, q) => s + q.titleScore, 0) / qualityScores.length),
    boundary: Math.round(qualityScores.reduce((s, q) => s + q.boundaryScore, 0) / qualityScores.length),
    entity: Math.round(qualityScores.reduce((s, q) => s + q.entityScore, 0) / qualityScores.length),
    event: Math.round(qualityScores.reduce((s, q) => s + q.eventScore, 0) / qualityScores.length),
    confidence: Math.round(qualityScores.reduce((s, q) => s + q.confidence, 0) / qualityScores.length),
    duplicateRate: pct(qualityScores.filter((q) => q.duplicateTitle).length, qualityScores.length),
  };

  const founderScore = await scorecard(founderId);
  const devScore = await scorecard(developerId);

  const gaps = await gapAnalysis(allEpisodes, founderId);

  const report = {
    generatedAt: new Date().toISOString(),
    phase1_coverage: {
      founder: { ...founderCoverage, episodes: undefined },
      developer: { ...devCoverage, episodes: undefined },
    },
    phase2_quality: {
      sampleSize: qualityScores.length,
      averages: avgQuality,
      samples: qualityScores.slice(0, 10),
    },
    phase3_reconstruction: {
      baseline: BASELINE_SCORECARD,
      afterEpisodes: {
        founder: founderScore,
        developer: devScore,
      },
      delta: {
        founderOverall: founderScore.overall - BASELINE_SCORECARD.overall,
        founderThreadContinuity: founderScore.threadContinuity - BASELINE_SCORECARD.threadContinuity,
        founderRecall: founderScore.recallAccuracy - BASELINE_SCORECARD.recallAccuracy,
      },
    },
    phase4_threadIntelligence: {
      founder: founderScore.threadIntelligence,
      developer: devScore.threadIntelligence,
    },
    phase5_gaps: gaps,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

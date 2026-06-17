/**
 * Trust Center orchestrator — Phases 1–5 combined.
 */
import { auditAllDomainCoverage } from './knowledgeCoverageService';
import { classifyAllDomainStates, aggregateStateTotals } from './knowledgeStateService';
import { detectUnknowns } from './unknownDetectionService';
import { buildReviewQueue } from './reviewPriorityService';
import type { ConfidenceDistribution, DomainCoverageMetrics, TrustDomain, TrustOverview } from './trustTypes';
import { TRUST_DOMAINS } from './trustTypes';

function mergeStateCountsIntoCoverage(
  coverage: DomainCoverageMetrics[],
  byDomain: Partial<Record<TrustDomain, Record<string, number>>>
): DomainCoverageMetrics[] {
  return coverage.map((row) => ({
    ...row,
    states: {
      known: byDomain[row.domain]?.known ?? row.states.known,
      suggested: byDomain[row.domain]?.suggested ?? row.states.suggested,
      unverified: byDomain[row.domain]?.unverified ?? row.states.unverified,
      conflicted: byDomain[row.domain]?.conflicted ?? row.states.conflicted,
      archived: byDomain[row.domain]?.archived ?? row.states.archived,
    },
  }));
}

function overallConfidence(coverage: DomainCoverageMetrics[]): {
  average: number;
  distribution: ConfidenceDistribution;
} {
  const distribution: ConfidenceDistribution = { high: 0, medium: 0, low: 0, none: 0 };
  let sum = 0;
  let n = 0;
  for (const row of coverage) {
    sum += row.coverage_score;
    n += 1;
    for (const [bucket, count] of Object.entries(row.confidence_distribution)) {
      distribution[bucket as keyof ConfidenceDistribution] += count;
    }
  }
  return {
    average: n ? Math.round(sum / n) : 0,
    distribution,
  };
}

export async function buildTrustOverview(userId: string): Promise<TrustOverview> {
  const [{ byDomain, entities }, unknowns] = await Promise.all([
    classifyAllDomainStates(userId),
    detectUnknowns(userId),
  ]);

  let coverage = await auditAllDomainCoverage(userId, byDomain);
  coverage = mergeStateCountsIntoCoverage(coverage, byDomain);

  const { conflicts, review_queue } = await buildReviewQueue(userId, unknowns, entities);
  const state_totals = aggregateStateTotals(byDomain);
  const overall_coverage_score =
    coverage.length > 0
      ? Math.round(coverage.reduce((s, r) => s + r.coverage_score, 0) / coverage.length)
      : 0;

  return {
    generated_at: new Date().toISOString(),
    user_id: userId,
    coverage,
    overall_coverage_score,
    confidence: overallConfidence(coverage),
    unknowns,
    conflicts,
    review_queue,
    state_totals,
  };
}

export async function getDomainTrustSummary(userId: string, domain: TrustDomain) {
  const overview = await buildTrustOverview(userId);
  const domainCoverage = overview.coverage.find((c) => c.domain === domain);
  const domainUnknowns = overview.unknowns.filter((u) => u.domain === domain);
  const domainReview = overview.review_queue.filter((r) => r.domain === domain);
  return {
    domain,
    ...domainCoverage,
    unknowns: domainUnknowns,
    review_items: domainReview,
  };
}

export function formatBookTrustLine(domain: TrustDomain, coverage: DomainCoverageMetrics): string {
  const { states, entity_count } = coverage;
  const parts: string[] = [`${entity_count} total`];
  if (states.suggested > 0) parts.push(`${states.suggested} suggested`);
  if (states.conflicted > 0) parts.push(`${states.conflicted} conflicts`);
  if (states.unverified > 0) parts.push(`${states.unverified} unverified`);
  return parts.join(' · ');
}

export { TRUST_DOMAINS };

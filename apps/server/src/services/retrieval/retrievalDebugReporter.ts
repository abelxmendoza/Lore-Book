import type {
  MemoryRetrievalResult,
  RetrievalDebugReport,
  RetrievedMemory,
} from './retrievalTypes';
import { truthRankForRecord } from './truthStateRetrievalFilter';

export function buildRetrievalDebugReport(
  query: string,
  candidateCount: number,
  afterTruthFilter: number,
  results: RetrievedMemory[],
): RetrievalDebugReport {
  const truthRankDistribution: Record<string, number> = {};
  for (const r of results) {
    const rank = truthRankForRecord(r.record);
    truthRankDistribution[rank] = (truthRankDistribution[rank] ?? 0) + 1;
  }

  const topReasons = [
    ...new Set(results.flatMap((r) => r.retrievalReasons)),
  ].slice(0, 8);

  return {
    query,
    candidateCount,
    afterTruthFilter,
    afterRanking: results.length,
    topReasons,
    truthRankDistribution,
    sensitiveCount: results.filter((r) => r.carefulPhrasing).length,
  };
}

export function formatDebugReport(report: RetrievalDebugReport): string {
  const lines = [
    `Query: ${report.query}`,
    `Candidates: ${report.candidateCount} → filtered: ${report.afterTruthFilter} → ranked: ${report.afterRanking}`,
    `Top reasons: ${report.topReasons.join(', ') || '(none)'}`,
    `Truth ranks: ${JSON.stringify(report.truthRankDistribution)}`,
    `Sensitive (careful phrasing): ${report.sensitiveCount}`,
  ];
  return lines.join('\n');
}

export function attachDebugReport(
  result: MemoryRetrievalResult,
  candidateCount: number,
  afterTruthFilter: number,
): MemoryRetrievalResult {
  return {
    ...result,
    debug: buildRetrievalDebugReport(
      result.memories[0]?.record.text ?? '',
      candidateCount,
      afterTruthFilter,
      result.memories,
    ),
  };
}

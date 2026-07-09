/**
 * ResultMerger — the single place where executor outputs become one answer
 * surface: deduplication, ranking, confidence weighting, provenance and
 * citation aggregation. Replaces scattered per-callsite merge logic.
 */

import type {
  Citation,
  ExecutorKind,
  MergedQueryResponse,
  QueryRecord,
  QueryResult,
} from './QueryTypes';

/** Source weights encode today's trust order: foundation > thread > claims >
 *  journal semantic > assembled context. */
const SOURCE_WEIGHT: Record<ExecutorKind, number> = {
  structured: 1.0,
  thread: 0.95,
  crystallized: 0.85,
  semantic: 0.75,
  working_memory: 0.6,
  graph: 0.9,
  timeline: 0.8,
  analytics: 0.8,
};

function recordKey(record: QueryRecord): string {
  if (record.id) return `id:${record.id}`;
  return `content:${record.content.trim().toLowerCase().slice(0, 160)}`;
}

function citationKey(citation: Citation): string {
  return `${citation.kind}:${citation.id}`;
}

export function mergeResults(results: QueryResult[]): MergedQueryResponse {
  const seenRecords = new Map<string, QueryRecord & { weighted: number }>();
  const seenCitations = new Map<string, Citation>();
  const provenance: MergedQueryResponse['provenance'] = [];
  const contributing = new Set<ExecutorKind>();

  for (const result of results) {
    if (result.error) continue;
    const weight = SOURCE_WEIGHT[result.source] ?? 0.5;

    for (const record of result.records) {
      const key = recordKey(record);
      const weighted = (record.score ?? result.confidence) * weight;
      const existing = seenRecords.get(key);
      // Dedupe: keep whichever copy the trust order ranks higher.
      if (!existing || weighted > existing.weighted) {
        seenRecords.set(key, { ...record, weighted });
      }
      contributing.add(result.source);
    }
    for (const citation of result.citations) {
      const key = citationKey(citation);
      if (!seenCitations.has(key)) seenCitations.set(key, citation);
    }
    provenance.push(...result.provenance);
  }

  const ranked = [...seenRecords.values()].sort((a, b) => b.weighted - a.weighted);

  // Overall confidence: best contributing source, softened when only weak
  // sources contributed. Never higher than the best executor claimed.
  const confidences = results
    .filter((r) => !r.error && r.records.length > 0)
    .map((r) => r.confidence * (SOURCE_WEIGHT[r.source] ?? 0.5));
  const confidence = confidences.length ? Math.min(1, Math.max(...confidences)) : 0;

  return {
    records: ranked.map(({ weighted: _weighted, ...record }) => record),
    citations: [...seenCitations.values()],
    provenance,
    confidence,
    contributingSources: [...contributing],
  };
}

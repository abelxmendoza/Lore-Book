import { collectProvenance, mergeConfidence } from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';

export function sortByTimeline(
  fragments: ConsolidationEvidenceFragment[],
): ConsolidationEvidenceFragment[] {
  return [...fragments].sort((a, b) => {
    const ta = a.eventAt ?? '';
    const tb = b.eventAt ?? '';
    if (ta && tb) return ta.localeCompare(tb);
    if (ta) return -1;
    if (tb) return 1;
    return a.sourceMessageId?.localeCompare(b.sourceMessageId ?? '') ?? 0;
  });
}

export function consolidateTimelineSummaries(
  fragments: ConsolidationEvidenceFragment[],
  seenAt?: string,
): ConsolidatedSummary[] {
  const timelineFrags = fragments.filter(
    (f) => f.kind === 'timeline' || f.eraLabels.length > 0 || f.eventAt,
  );
  const byEra = new Map<string, ConsolidationEvidenceFragment[]>();

  for (const fragment of timelineFrags) {
    const era = fragment.eraLabels[0] ?? fragment.eventAt?.slice(0, 4) ?? 'undated';
    const key = normalizeClaimKey(era);
    const list = byEra.get(key) ?? [];
    list.push(fragment);
    byEra.set(key, list);
  }

  const summaries: ConsolidatedSummary[] = [];
  for (const [key, frags] of byEra) {
    const sorted = sortByTimeline(frags);
    const era = sorted[0]?.eraLabels[0] ?? key;
    const events = sorted.map((f) => f.text);
    const summaryText = `${era}: ${events.join(' → ')}`;

    summaries.push({
      id: crypto.randomUUID(),
      summaryText,
      kind: 'timeline',
      subjectKey: key,
      confidence: mergeConfidence(sorted),
      mentionCount: sorted.length,
      ...collectProvenance(sorted),
      reviewRequired: sorted.some((f) => f.sensitiveCategories.length > 0),
      contradicted: false,
      timelineOrdered: true,
      createdAt: seenAt ?? new Date().toISOString(),
    });
  }

  return summaries;
}

export function timelineOrderPreserved(fragments: ConsolidationEvidenceFragment[]): boolean {
  const sorted = sortByTimeline(fragments);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].eventAt ?? '';
    const curr = sorted[i].eventAt ?? '';
    if (prev && curr && curr < prev) return false;
  }
  return true;
}

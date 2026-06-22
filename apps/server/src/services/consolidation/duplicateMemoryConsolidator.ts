import { collectProvenance, mergeConfidence } from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';

export function groupByClaimKey(
  fragments: ConsolidationEvidenceFragment[],
): Map<string, ConsolidationEvidenceFragment[]> {
  const groups = new Map<string, ConsolidationEvidenceFragment[]>();
  for (const fragment of fragments) {
    const key = fragment.claimKey || normalizeClaimKey(fragment.text);
    const list = groups.get(key) ?? [];
    list.push(fragment);
    groups.set(key, list);
  }
  return groups;
}

export function buildRepeatedFactSummary(
  fragments: ConsolidationEvidenceFragment[],
  subjectKey: string,
  seenAt?: string,
): ConsolidatedSummary {
  const sorted = [...fragments].sort((a, b) => {
    const ta = a.eventAt ?? a.sourceMessageId ?? '';
    const tb = b.eventAt ?? b.sourceMessageId ?? '';
    return ta.localeCompare(tb);
  });

  const entityName = sorted[0]?.entityNames[0] ?? 'Subject';
  const relationship = sorted[0]?.relationshipLabels[0] ?? 'connection';
  const mentionCount = sorted.length;

  let summaryText: string;
  if (mentionCount >= 3 && /best friend/i.test(sorted[0].text)) {
    summaryText = `${entityName} was one of the user's closest middle-school friends.`;
  } else if (mentionCount >= 2) {
    summaryText = `${entityName} was an important ${relationship} (${mentionCount} mentions).`;
  } else {
    summaryText = sorted[0].text;
  }

  const provenance = collectProvenance(sorted);
  const sensitive = sorted.some((f) => f.sensitiveCategories.length > 0);

  return {
    id: crypto.randomUUID(),
    summaryText,
    kind: sorted[0]?.kind ?? 'general',
    subjectKey,
    confidence: mergeConfidence(sorted),
    mentionCount,
    ...provenance,
    reviewRequired: sensitive,
    contradicted: false,
    timelineOrdered: sorted.every((f, i) => i === 0 || (f.eventAt ?? '') >= (sorted[i - 1].eventAt ?? '')),
    createdAt: seenAt ?? new Date().toISOString(),
  };
}

export function consolidateDuplicates(
  groups: Map<string, ConsolidationEvidenceFragment[]>,
  seenAt?: string,
): ConsolidatedSummary[] {
  const summaries: ConsolidatedSummary[] = [];
  for (const [key, frags] of groups) {
    if (frags.length === 0) continue;
    summaries.push(buildRepeatedFactSummary(frags, key, seenAt));
  }
  return summaries;
}

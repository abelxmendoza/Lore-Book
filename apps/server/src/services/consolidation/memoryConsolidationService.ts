import { splitContradictoryGroups } from './contradictionAwareConsolidator';
import {
  fragmentsWithProvenance,
  rejectSummaryWithoutProvenance,
  summaryHasProvenance,
} from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationInput,
  ConsolidationResult,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';
import { consolidateDuplicates, groupByClaimKey } from './duplicateMemoryConsolidator';
import { consolidateEntitySummaries } from './entitySummaryConsolidator';
import { consolidateNarrativeAnchorSummaries } from './narrativeAnchorConsolidator';
import { consolidateRelationshipSummaries } from './relationshipSummaryConsolidator';
import { consolidateTimelineSummaries } from './timelineSummaryConsolidator';

function groupByEntityName(
  fragments: ConsolidationEvidenceFragment[],
): Map<string, ConsolidationEvidenceFragment[]> {
  const map = new Map<string, ConsolidationEvidenceFragment[]>();
  for (const fragment of fragments) {
    if (fragment.entityNames.length === 0) continue;
    const key = normalizeClaimKey(fragment.entityNames[0]);
    const list = map.get(key) ?? [];
    list.push(fragment);
    map.set(key, list);
  }
  return map;
}

function filterEligible(fragments: ConsolidationEvidenceFragment[]): {
  eligible: ConsolidationEvidenceFragment[];
  rejectedExcluded: number;
  supersededExcluded: number;
} {
  let rejectedExcluded = 0;
  let supersededExcluded = 0;

  const correctedFromIds = new Set(
    fragments.filter((f) => f.correctedFromId).map((f) => f.correctedFromId!),
  );

  const eligible = fragments.filter((f) => {
    if (f.truthState === 'rejected') {
      rejectedExcluded++;
      return false;
    }
    if (f.supersededById) {
      supersededExcluded++;
      return false;
    }
    if (correctedFromIds.has(f.id)) {
      supersededExcluded++;
      return false;
    }
    return true;
  });

  return { eligible, rejectedExcluded, supersededExcluded };
}

function dedupeSummaries(summaries: ConsolidatedSummary[]): ConsolidatedSummary[] {
  const map = new Map<string, ConsolidatedSummary>();
  for (const summary of summaries) {
    const existing = map.get(summary.subjectKey);
    if (!existing || summary.mentionCount > existing.mentionCount) {
      map.set(summary.subjectKey, summary);
    }
  }
  return [...map.values()];
}

function applySensitiveReviewGate(summaries: ConsolidatedSummary[]): ConsolidatedSummary[] {
  return summaries.map((s) =>
    s.reviewRequired ? { ...s, reviewRequired: true } : s,
  );
}

export function consolidateMemories(input: ConsolidationInput): ConsolidationResult {
  const { eligible, rejectedExcluded, supersededExcluded } = filterEligible(input.fragments);
  const withProvenance = fragmentsWithProvenance(eligible);

  const entityGroups = groupByEntityName(withProvenance);
  const { contradictions } = splitContradictoryGroups(entityGroups);
  const contradictoryIds = new Set(contradictions.flatMap((c) => c.fragmentIds));
  const safeFragments = withProvenance.filter((f) => !contradictoryIds.has(f.id));

  const claimGroups = groupByClaimKey(safeFragments);
  const { safeGroups } = splitContradictoryGroups(claimGroups);

  const duplicateSummaries = consolidateDuplicates(safeGroups, input.seenAt);
  const entitySummaries = consolidateEntitySummaries(safeFragments, input.seenAt);
  const relationshipSummaries = consolidateRelationshipSummaries(safeFragments, input.seenAt);
  const timelineSummaries = consolidateTimelineSummaries(safeFragments, input.seenAt);
  const anchorSummaries = consolidateNarrativeAnchorSummaries(safeFragments, input.seenAt);

  let summaries = dedupeSummaries([
    ...duplicateSummaries,
    ...entitySummaries,
    ...relationshipSummaries,
    ...timelineSummaries,
    ...anchorSummaries,
  ]);

  summaries = applySensitiveReviewGate(
    summaries.filter((s) => !rejectSummaryWithoutProvenance(s) && summaryHasProvenance(s)),
  );

  return {
    summaries,
    contradictions,
    rejectedExcluded,
    supersededExcluded,
    fragmentsPreserved: input.fragments.length,
  };
}

export class MemoryConsolidationService {
  consolidate(input: ConsolidationInput): ConsolidationResult {
    return consolidateMemories(input);
  }
}

export const memoryConsolidationService = new MemoryConsolidationService();

export { summaryHasProvenance, fragmentsWithProvenance };

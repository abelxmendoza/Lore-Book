import {
  buildClarificationPrompt,
  findAmbiguousEntities,
  resolveEntityMentions,
  retrieveAnchorsForEntities,
  retrieveByEntity,
} from './entityAwareRetriever';
import { retrieveByAnchor } from './narrativeAnchorRetriever';
import { bindProvenanceToResults, allResultsHaveProvenance } from './retrievalProvenanceBinder';
import { rankRecords } from './retrievalRankingService';
import { buildRetrievalDebugReport } from './retrievalDebugReporter';
import { retrieveByRelationship } from './relationshipAwareRetriever';
import { retrieveByTimeline } from './timelineAwareRetriever';
import type {
  MemoryRetrievalResult,
  RetrievalAnchorRef,
  RetrievalEntityRef,
  RetrievalMemoryRecord,
  RetrievalQueryContext,
} from './retrievalTypes';
import {
  filterForRecall,
  preferCorrectedVersion,
} from './truthStateRetrievalFilter';

export type MemoryRetrievalCorpus = {
  records: RetrievalMemoryRecord[];
  entities: RetrievalEntityRef[];
  anchors: RetrievalAnchorRef[];
};

function uniqueRecords(lists: RetrievalMemoryRecord[][]): RetrievalMemoryRecord[] {
  const map = new Map<string, RetrievalMemoryRecord>();
  for (const list of lists) {
    for (const r of list) map.set(r.id, r);
  }
  return [...map.values()];
}

function retrieveByTextMatch(records: RetrievalMemoryRecord[], query: string): RetrievalMemoryRecord[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return [];
  return records.filter((r) => tokens.some((t) => r.text.toLowerCase().includes(t)));
}

export class MemoryRetrievalService {
  retrieve(
    context: RetrievalQueryContext,
    corpus: MemoryRetrievalCorpus,
  ): MemoryRetrievalResult {
    const { query, limit = 10 } = context;
    const { records, entities, anchors } = corpus;

    const ambiguousEntities = findAmbiguousEntities(query, entities);
    const needsClarification = ambiguousEntities.length > 1;

    const mentionedEntities = resolveEntityMentions(query, entities);
    const entityAnchorIds = retrieveAnchorsForEntities(
      anchors,
      mentionedEntities.map((e) => e.id),
    ).map((a) => a.id);

    const candidatePools = [
      retrieveByEntity(records, entities, query),
      retrieveByAnchor(records, anchors, entityAnchorIds),
      retrieveByTimeline(records, query),
      retrieveByRelationship(records, query, entities),
      retrieveByTextMatch(records, query),
    ];

    const candidates = uniqueRecords(candidatePools);
    const candidateCount = candidates.length;

    const { kept, filteredRejected, filteredSuperseded } = filterForRecall(candidates);
    const correctedPreferred = preferCorrectedVersion(kept);
    const afterTruthFilter = correctedPreferred.length;

    const ranked = rankRecords(correctedPreferred, query, entities, anchors);
    const bound = bindProvenanceToResults(ranked.slice(0, limit));

    if (bound.length > 0 && !allResultsHaveProvenance(bound)) {
      throw new Error('Recall provenance invariant violated');
    }

    const matchedAnchors = retrieveAnchorsForEntities(
      anchors,
      mentionedEntities.map((e) => e.id),
    );

    return {
      memories: bound,
      entities: mentionedEntities,
      anchors: matchedAnchors,
      ambiguousEntities,
      needsClarification,
      clarificationPrompt: needsClarification
        ? buildClarificationPrompt(ambiguousEntities)
        : undefined,
      filteredRejected,
      filteredSuperseded,
      debug: buildRetrievalDebugReport(query, candidateCount, afterTruthFilter, bound),
    };
  }
}

export const memoryRetrievalService = new MemoryRetrievalService();

export function retrieveMemories(
  context: RetrievalQueryContext,
  corpus: MemoryRetrievalCorpus,
): MemoryRetrievalResult {
  return memoryRetrievalService.retrieve(context, corpus);
}

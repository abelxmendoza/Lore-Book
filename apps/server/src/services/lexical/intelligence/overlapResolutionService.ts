import type { EntityType, LexicalIntelligenceSpan, OverlapResolutionRecord } from './lexicalIntelligenceTypes';
import { isParentSubgroupRelation } from './lexicalEntityTaxonomy';
import { SpanIntervalIndex, spansOverlap } from './spanIntervalIndex';

export type OverlapResolutionResult = {
  spans: LexicalIntelligenceSpan[];
  overlapsResolved: OverlapResolutionRecord[];
  warnings: string[];
};

export function resolveSpanOverlaps(spans: LexicalIntelligenceSpan[]): OverlapResolutionResult {
  const sorted = [...spans].sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  const kept: LexicalIntelligenceSpan[] = [];
  const keptIndex = new SpanIntervalIndex<LexicalIntelligenceSpan>();
  const droppedIds = new Set<string>();
  const overlapsResolved: OverlapResolutionRecord[] = [];
  const warnings: string[] = [];

  for (const span of sorted) {
    if (droppedIds.has(span.id)) continue;

    const container = keptIndex.findTightestContainer(span.start, span.end);
    if (container) {
      if (isParentSubgroupRelation(container, span)) {
        const linked = { ...span, parentSpanId: container.id };
        kept.push(linked);
        keptIndex.add(linked);
        continue;
      }
      droppedIds.add(span.id);
      overlapsResolved.push({
        keptId: container.id,
        droppedIds: [span.id],
        reason: 'shorter span contained in longer match',
      });
      continue;
    }

    const parentChild = keptIndex.findOverlapping(
      span,
      (k, incoming) => isParentSubgroupRelation(k, incoming),
      span
    );
    if (parentChild) {
      const linked = { ...span, parentSpanId: parentChild.id };
      kept.push(linked);
      keptIndex.add(linked);
      continue;
    }

    const linkedTravel = keptIndex.findOverlapping(
      span,
      (k, incoming) =>
        (k.type === 'TRAVEL_DESTINATION' || k.type === 'PLACE') &&
        incoming.type === 'EVENT' &&
        incoming.subtype === 'TRAVEL_EVENT' &&
        incoming.text.toLowerCase().includes(k.text.toLowerCase()),
      span
    );
    if (linkedTravel) {
      const linked = { ...span, parentSpanId: linkedTravel.id };
      kept.push(linked);
      keptIndex.add(linked);
      continue;
    }

    const sameKindOverlap = keptIndex.findOverlapping(
      span,
      (k, incoming) =>
        spansOverlap(k, incoming) &&
        (k.type === incoming.type || k.colorKey === incoming.colorKey) &&
        !isParentSubgroupRelation(k, incoming) &&
        !isParentSubgroupRelation(incoming, k),
      span
    );

    if (sameKindOverlap) {
      const keepCurrent = span.end - span.start > sameKindOverlap.end - sameKindOverlap.start;
      if (keepCurrent) {
        const idx = kept.indexOf(sameKindOverlap);
        if (idx >= 0) kept.splice(idx, 1);
        keptIndex.remove(sameKindOverlap);
        droppedIds.add(sameKindOverlap.id);
        kept.push(span);
        keptIndex.add(span);
        overlapsResolved.push({
          keptId: span.id,
          droppedIds: [sameKindOverlap.id],
          reason: 'same-kind overlap — kept longer span',
        });
      } else {
        droppedIds.add(span.id);
        overlapsResolved.push({
          keptId: sameKindOverlap.id,
          droppedIds: [span.id],
          reason: 'same-kind overlap — kept existing longer span',
        });
      }
      continue;
    }

    kept.push(span);
    keptIndex.add(span);
  }

  const orgIndex = new SpanIntervalIndex<LexicalIntelligenceSpan>();
  for (const s of kept) {
    if (s.type === 'ORGANIZATION') orgIndex.add(s);
  }

  const filtered = kept.filter((s) => {
    if (s.type !== 'PERSON') return true;
    const org = orgIndex.findTightestContainer(s.start, s.end);
    if (org && org.type === 'ORGANIZATION') {
      droppedIds.add(s.id);
      overlapsResolved.push({
        keptId: org.id,
        droppedIds: [s.id],
        reason: 'person span inside organization name',
      });
      return false;
    }
    return true;
  });

  return {
    spans: filtered.sort((a, b) => a.start - b.start),
    overlapsResolved,
    warnings,
  };
}

export function filterNoiseSpans(spans: LexicalIntelligenceSpan[]): LexicalIntelligenceSpan[] {
  const pronouns = /^(?:I|we|you|he|she|they|it|me|him|her|us|them|my|our|your)$/i;
  return spans.filter((s) => {
    if (pronouns.test(s.text.trim())) return false;
    if (s.colorKey === 'uncertain' && s.text.trim().length <= 3) return false;
    return true;
  });
}

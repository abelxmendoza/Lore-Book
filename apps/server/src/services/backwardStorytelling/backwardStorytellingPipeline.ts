/**
 * Backward-Storytelling–Safe Narrative Ingestion Pipeline
 *
 * Chat/Journal Input → NarrativeSegmentation → StoryTimeInference → ResolveDates → Materialize → (optional: create arcs + threads/relations)
 *
 * Never equates "said first" with "happened first".
 */

import { logger } from '../../logger';
import { timelineManager } from '../timelineManager';
import { threadService } from '../threads/threadService';
import { threadMembershipService } from '../threads/threadMembershipService';
import { nodeRelationService } from '../threads/nodeRelationService';
import type { NodeRelationType } from '../../types/threads';

import { segmentNarrative } from './narrativeSegmentationService';
import { inferStoryTime } from './storyTimeInferenceService';
import { resolveStoryDates } from './storyTimeResolver';
import { materializeStorySlices, type MaterializeInput } from './entryMaterializationService';

import type { NarrativeSegment, StorySlice, StoryTimeContext, StoryTimeInference } from './types';

export type BackwardStorytellingInput = {
  userId: string;
  text: string;
  source: 'chat' | 'journal';
  /** Optional parent entry id when this narrative was extracted from one entry (e.g. one chat blob) */
  sourceEntryId?: string;
  /** When the user said it (e.g. chat timestamp). Not used for story order. */
  sourceTimestamp?: string;
  context?: StoryTimeContext;
  tags?: string[];
  /** When true and parentSagaId is set, pipeline creates arcs under that saga and wires threads/relations from inference. */
  createArcs?: boolean;
  /** When set (and createArcs is true), arcs are created under this saga and threads/relations are wired from inference. */
  parentSagaId?: string;
};

export type BackwardStorytellingResult = {
  slices: StorySlice[];
  segments: NarrativeSegment[];
  lowConfidenceSegmentIds: string[];
  /** When confidence < 0.4, caller may flag for user review or ask "Did X happen before or after Y?" */
  suggestedReviewPrompt?: string;
};

const LOW_CONFIDENCE_THRESHOLD = 0.4;

/** Create arcs under parentSagaId and wire threads/relations from inference. Called only when parentSagaId is set. */
async function materializeArcsAndThreads(
  userId: string,
  segments: NarrativeSegment[],
  resolved: StoryTimeInference[],
  parentSagaId: string
): Promise<void> {
  const segmentToArcId: Record<string, string> = {};
  const defaultDate = new Date().toISOString().slice(0, 10);

  for (const segment of segments) {
    const inf = resolved.find((r) => r.segment_id === segment.segment_id);
    const start = inf?.start_date ?? defaultDate;
    const end = inf?.end_date ?? null;
    const title = segment.text.slice(0, 200).trim() || `Segment ${segment.segment_id.slice(0, 8)}`;
    const arc = await timelineManager.createNode(userId, 'arc', {
      title,
      start_date: start,
      end_date: end,
      parent_id: parentSagaId,
    });
    segmentToArcId[segment.segment_id] = (arc as { id: string }).id;
  }

  for (const segment of segments) {
    const inf = resolved.find((r) => r.segment_id === segment.segment_id);
    const arcId = segmentToArcId[segment.segment_id];
    if (!arcId) continue;
    for (const name of inf?.threads ?? []) {
      try {
        const thread = await threadService.findOrCreateByName(userId, name);
        await threadMembershipService.addMembership(userId, thread.id, arcId, 'arc', 'primary');
      } catch (e) {
        logger.warn({ userId, segmentId: segment.segment_id, threadName: name, error: e }, 'Thread membership skipped');
      }
    }
  }

  for (const segment of segments) {
    const inf = resolved.find((r) => r.segment_id === segment.segment_id);
    const fromId = segmentToArcId[segment.segment_id];
    if (!fromId) continue;
    for (const rel of inf?.relations ?? []) {
      const toId = segmentToArcId[rel.target_segment_id];
      if (!toId || toId === fromId) continue;
      try {
        await nodeRelationService.create(
          userId,
          { nodeId: fromId, nodeType: 'arc' },
          { nodeId: toId, nodeType: 'arc' },
          rel.type as NodeRelationType,
          undefined
        );
      } catch (e) {
        logger.warn({ userId, fromId, toId, type: rel.type, error: e }, 'Node relation skipped');
      }
    }
  }

  logger.info({ userId, parentSagaId, arcCount: Object.keys(segmentToArcId).length }, 'Arcs and thread/relation wiring completed');
}

/**
 * Run the full backward-storytelling–safe pipeline.
 * Use when the user has told a narrative that may be out of chronological order.
 */
export async function runBackwardStorytellingPipeline(
  input: BackwardStorytellingInput
): Promise<BackwardStorytellingResult> {
  const { userId, text, source, sourceEntryId, context = {}, tags = [] } = input;

  // Step 1: Segment narrative (structure only, no time)
  const segments = segmentNarrative(text);
  if (segments.length === 0) {
    logger.debug({ userId, textLength: text.length }, 'BackwardStorytelling: no segments produced');
    return { slices: [], segments: [], lowConfidenceSegmentIds: [] };
  }

  // Single segment: no need for full pipeline; could still infer date and save one entry
  if (segments.length === 1) {
    const inferences = await inferStoryTime(segments, context);
    const resolved = resolveStoryDates(inferences, context.knownAnchors ?? {});
    const materializeInput: MaterializeInput = {
      userId,
      segments,
      resolvedTimes: resolved,
      source,
      sourceEntryId,
      tags,
    };
    const slices = await materializeStorySlices(materializeInput);
    const createArcs = input.createArcs ?? false;
    const parentSagaId = input.parentSagaId ?? context.parentSagaId;
    if (createArcs && parentSagaId) {
      await materializeArcsAndThreads(userId, segments, resolved, parentSagaId);
    }
    const low = resolved.filter(r => r.confidence < LOW_CONFIDENCE_THRESHOLD).map(r => r.segment_id);
    return {
      slices,
      segments,
      lowConfidenceSegmentIds: low,
      suggestedReviewPrompt: low.length > 0 ? 'One or more parts of this story had unclear timing. Did anything happen in a different order than you said it?' : undefined,
    };
  }

  // Step 2: Infer story time (when it happened) per segment
  const inferences = await inferStoryTime(segments, {
    ...context,
    sourceTimestamp: input.sourceTimestamp,
  });

  // Step 3: Resolve relative → absolute dates
  const resolved = resolveStoryDates(inferences, context.knownAnchors ?? {});

  // Step 4: Materialize as journal entries (normal entries with date = when it happened)
  const materializeInput: MaterializeInput = {
    userId,
    segments,
    resolvedTimes: resolved,
    source,
    sourceEntryId,
    tags,
  };
  const slices = await materializeStorySlices(materializeInput);

  // Optional Step 5: create arcs under parentSagaId and wire threads/relations (when createArcs && parentSagaId)
  const createArcs = input.createArcs ?? false;
  const parentSagaId = input.parentSagaId ?? input.context?.parentSagaId;
  if (createArcs && parentSagaId) {
    await materializeArcsAndThreads(userId, segments, resolved, parentSagaId);
  }

  // Optional: run timeline assignment on new entries if they have chapter_id (unchanged logic)
  // Timeline assignment in this codebase runs on memory components, not raw entries. Entries are just dated;
  // chronology/biography/timeline views sort by entry.date. So we do nothing extra here unless we later
  // add component extraction per slice and then batchAssignTimeline.

  const lowConfidenceSegmentIds = resolved
    .filter(r => r.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map(r => r.segment_id);

  const suggestedReviewPrompt =
    lowConfidenceSegmentIds.length > 0
      ? 'You mentioned some parts of this story that have unclear timing — did anything happen in a different order than you said it?'
      : undefined;

  logger.info(
    { userId, segmentCount: segments.length, sliceCount: slices.length, lowConfidence: lowConfidenceSegmentIds.length },
    'BackwardStorytelling pipeline completed'
  );

  return {
    slices,
    segments,
    lowConfidenceSegmentIds,
    suggestedReviewPrompt,
  };
}

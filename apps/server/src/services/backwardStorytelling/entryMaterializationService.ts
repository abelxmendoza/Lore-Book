/**
 * EntryMaterializationService
 * Materializes narrative segments + resolved story times into journal entries (StorySlices).
 * Saves as normal journal entries so downstream (timeline assignment, chronology) works unchanged.
 */

import { logger } from '../../logger';

import { memoryService } from '../memoryService';

import type { NarrativeSegment, StorySlice, StoryTimeInference } from './types';

function findTimeForSegment(segmentId: string, times: StoryTimeInference[]): StoryTimeInference | undefined {
  return times.find(t => t.segment_id === segmentId);
}

export type MaterializeInput = {
  userId: string;
  segments: NarrativeSegment[];
  resolvedTimes: StoryTimeInference[];
  source: 'chat' | 'journal';
  sourceEntryId?: string;
  tags?: string[];
  /** Fallback when a segment has no resolved date */
  defaultDate?: string;
};

/**
 * Materialize segments + times into journal entries (story slices).
 * Each slice is saved as a normal journal entry with date = "when it happened".
 * Returns slices with entry_id = id of the saved entry.
 */
export async function materializeStorySlices(input: MaterializeInput): Promise<StorySlice[]> {
  const {
    userId,
    segments,
    resolvedTimes,
    source,
    sourceEntryId,
    tags = [],
    defaultDate = new Date().toISOString(),
  } = input;

  const slices: StorySlice[] = [];

  for (const segment of segments) {
    const time = findTimeForSegment(segment.segment_id, resolvedTimes);
    const when = (time?.start_date ? `${time.start_date}T12:00:00.000Z` : defaultDate).slice(0, 19) + 'Z';

    try {
      const entry = await memoryService.saveEntry({
        userId,
        content: segment.text,
        date: when,
        tags: [...tags, 'story_slice'],
        source,
        narrativeOrder: segment.narrative_order,
        derivedFromEntryId: sourceEntryId ?? null,
        metadata: {
          narrative_order: segment.narrative_order,
          derived_from_entry_id: sourceEntryId ?? null,
          segment_id: segment.segment_id,
          inference_confidence: time?.confidence ?? null,
          backward_storytelling: true,
        },
      });

      slices.push({
        entry_id: entry.id,
        content: segment.text,
        date: when,
        narrative_order: segment.narrative_order,
        source,
        derived_from_entry_id: sourceEntryId,
        segment_id: segment.segment_id,
        inference_confidence: time?.confidence,
      });
    } catch (error) {
      logger.error({ error, segmentId: segment.segment_id, userId }, 'Failed to save story-slice entry');
      throw error;
    }
  }

  logger.info({ userId, sliceCount: slices.length, source }, 'Story slices materialized');
  return slices;
}

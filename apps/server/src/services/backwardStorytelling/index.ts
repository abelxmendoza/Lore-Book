/**
 * Backward-Storytelling–Safe Narrative Ingestion
 *
 * Correctly handles stories told out of chronological order by:
 * - Separating narrative order from story time
 * - Assigning a "when it happened" timestamp per segment
 * - Persisting as normal journal entries (downstream unchanged)
 *
 * Never equate "said first" with "happened first".
 */

export { runBackwardStorytellingPipeline } from './backwardStorytellingPipeline';
export type { BackwardStorytellingInput, BackwardStorytellingResult } from './backwardStorytellingPipeline';

export { segmentNarrative } from './narrativeSegmentationService';
export { inferStoryTime } from './storyTimeInferenceService';
export { resolveStoryDates } from './storyTimeResolver';
export { materializeStorySlices } from './entryMaterializationService';
export type { MaterializeInput } from './entryMaterializationService';

export type {
  NarrativeSegment,
  StoryTimeInference,
  StorySlice,
  StoryTimeContext,
  LifeAnchors,
  LifeAnchor,
  TemporalRelation,
} from './types';

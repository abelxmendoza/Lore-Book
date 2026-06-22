/**
 * Timeline Engine Service - Main exports
 */

export { TimelineEngine } from './timelineEngine';
export { TimelineSyncService } from './timelineSyncService';
export { TimelinePresets } from './timelinePresets';
export * from './normalizers';
export type { TimelineFilter, TimelineEvent } from './timelineEngine';

export * from './timelineStitchingTypes';
export { stitchTimelineFromMessage, shouldCreateTimeBookCard } from './timelineStitchingService';
export { sortTimelineAnchorsChronologically } from './chronologySorter';
export { hasAnchorProvenance } from './timelineProvenanceService';
export {
  runTimelineStitchingForMessage,
  rescanTimelineStitching,
} from './timelineStitchingIntegrationService';
export { isBlockedTimeSuggestion } from './timelineSuggestionGuard';
export { loadTimelineAnchorsForUser } from './timelineStitchingPersistenceService';


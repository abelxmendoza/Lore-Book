export {
  TEMPORAL_CONFIDENCE_CEILINGS,
  applyTemporalConfidenceCeiling,
  ceilingForTemporal,
  isImportOrRecoveryTag,
} from './temporalConfidenceCeilings';

export {
  detectTemporalContradiction,
  extractTextualDateClaims,
  suggestedOccurrenceIso,
  type TemporalContradiction,
} from './temporalContradiction';

export {
  classifyTimelineSpeechAct,
  evaluateTimelineEligibility,
  type TimelineEligibility,
  type TimelineSpeechAct,
  type TimelineSurface,
} from './timelineSpeechActGate';

export {
  evaluateArcEligibility,
  shouldDrawAsSwimlaneBar,
  type ArcEligibility,
} from './arcEligibility';

export {
  applyDomainRoutingGuards,
  guardTrackFromText,
  type ArcTrack,
  type DomainGuardResult,
} from './domainRoutingGuards';

export {
  projectCanonicalTimeline,
  inferCanonicalEventType,
  mapWebTimePrecision,
  type ProjectableTimelineItem,
  type ProjectedTimelineItem,
  type ProjectionRole,
  type OccurrenceStatus,
  type CanonicalEventType,
} from './canonicalTimelineProjector';

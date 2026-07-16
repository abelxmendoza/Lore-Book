/**
 * Strict record types for the Story of Self pipeline.
 *
 * The old engine flattened everything — entity metadata, raw chat fragments,
 * journal events — into one bucket and let any of it become a "turning point".
 * These types make each pipeline stage's contract explicit, and the stage
 * guards below reject records that try to flow into a stage they don't belong
 * in (e.g. an entity_fact arriving at turning-point assessment).
 */

export type NarrativeRecordType =
  | 'identity_fact'
  | 'entity_fact'
  | 'relationship_fact'
  | 'event'
  | 'turning_point'
  | 'life_chapter'
  | 'theme'
  | 'current_state'
  | 'uncertainty';

export type LifeDomain =
  | 'education'
  | 'career'
  | 'relationships'
  | 'family'
  | 'health'
  | 'location'
  | 'projects'
  | 'community'
  | 'finances'
  | 'beliefs'
  | 'recreation'
  | 'identity';

/** Domains that anchor who someone is; they outrank isolated recent anecdotes. */
export const FOUNDATIONAL_DOMAINS: ReadonlySet<LifeDomain> = new Set([
  'education',
  'career',
  'family',
  'relationships',
  'projects',
  'community',
  'beliefs',
  'identity',
]);

export type EvidenceKind = 'usable' | 'conversational_fragment' | 'system_artifact';

export interface ResolvedMention {
  entityId: string;
  surface: string;
  confidence: number;
}

/** A normalized unit of evidence derived from one memory entry. */
export interface EvidenceRecord {
  id: string;
  /** Cleaned text. Never rendered verbatim to the user. */
  text: string;
  date?: string;
  source: string;
  conversationId?: string;
  mood?: string;
  emotionalIntensity?: number;
  tags: string[];
  contentType?: string;
  kind: EvidenceKind;
  recordType: NarrativeRecordType;
  domains: LifeDomain[];
  mentions: ResolvedMention[];
}

export interface KnownEntity {
  id: string;
  name: string;
  aliases: string[];
  kind: 'person' | 'organization' | 'place' | 'other';
  /** e.g. "uncle", "coworker", "partner" — used to disambiguate name collisions. */
  relationshipRole?: string;
  /** Entity ids this entity must never be merged/confused with. */
  distinctFromIds: string[];
}

export interface EntitySeparationConstraint {
  entityIdA: string;
  entityIdB: string;
  reason: string;
  evidenceIds: string[];
  confidence: number;
}

export interface ImportanceSignals {
  identityRelevance: number;
  duration: number;
  lifeChangeMagnitude: number;
  emotionalImpact: number;
  recurrenceAcrossTime: number;
  userEmphasis: number;
  relationshipSignificance: number;
  achievementSignificance: number;
  causalImpact: number;
  recency: number;
  evidenceStrength: number;
}

export interface CanonicalEvent {
  id: string;
  title: string;
  summary: string;
  startTime?: string;
  endTime?: string;
  entityIds: string[];
  locationIds: string[];
  organizationIds: string[];
  evidenceIds: string[];
  domains: LifeDomain[];
  confidence: number;
  importanceScore: number;
  importanceSignals?: ImportanceSignals;
}

export type ArcLabel =
  | 'victory'
  | 'fall'
  | 'awakening'
  | 'transition'
  | 'conflict'
  | 'ordinary_event';

export type TurningPointRejectionReason =
  | 'insufficient_magnitude'
  | 'no_durable_state_change'
  | 'duplicate_of_event'
  | 'entity_metadata_only'
  | 'isolated_anecdote'
  | 'unclear_temporal_effect';

export interface TurningPointAssessment {
  eventId: string;
  beforeState?: string;
  event: string;
  afterState?: string;
  affectedDomains: LifeDomain[];
  arcLabel: ArcLabel;
  magnitude: number;
  persistence: number;
  confidence: number;
  reasoning: string;
  accepted: boolean;
  rejectionReason?: TurningPointRejectionReason;
}

export interface LifeChapter {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  summary: string;
  definingContext: string;
  eventIds: string[];
  dominantDomains: LifeDomain[];
  confidence: number;
}

export interface Theme {
  id: string;
  label: string;
  description: string;
  supportingEventIds: string[];
  chapterIds: string[];
  confidence: number;
  contradictionIds?: string[];
}

export interface CurrentChapter {
  chapterId?: string;
  whatChanged: string;
  trajectory: string;
  openTensions: string[];
  activePursuits: string[];
}

export interface Uncertainty {
  description: string;
  evidenceIds: string[];
}

export interface NarrativeSynthesisResult {
  identitySummary: string;
  lifeChapters: LifeChapter[];
  turningPoints: TurningPointAssessment[];
  themes: Theme[];
  currentChapter?: CurrentChapter;
  uncertainties: Uncertainty[];
  /** canonical event id → evidence ids; kept internal unless sources are requested. */
  evidenceMap: Record<string, string[]>;
}

export interface StoryOfSelfTrace {
  queryIntent: string;
  retrievedEvidenceCount: number;
  usableEvidenceCount: number;
  filteredFragmentCount: number;
  dateRangeCovered?: { earliest?: string; latest?: string };
  domainCoverage: Record<string, number>;
  canonicalEventCount: number;
  duplicateClusters: number;
  rejectedTurningPoints: { candidateId: string; reason: string }[];
  selectedTurningPoints: string[];
  selectedChapterIds: string[];
  selectedThemeIds: string[];
  entityCollisionWarnings: string[];
  leakageCheckPassed: boolean;
  qualityGateResults: Record<string, boolean>;
}

export class StoryOfSelfPipelineError extends Error {
  constructor(
    public readonly stage: string,
    message: string
  ) {
    super(`[storyOfSelf:${stage}] ${message}`);
    this.name = 'StoryOfSelfPipelineError';
  }
}

const EVENT_STAGE_TYPES: ReadonlySet<NarrativeRecordType> = new Set(['event', 'current_state']);

/**
 * Clustering (and everything downstream of it that produces events, turning
 * points, and chapters) may only consume event-like evidence. Entity facts,
 * identity facts, and fragments must be routed elsewhere.
 */
export function assertEventStageInput(stage: string, records: EvidenceRecord[]): void {
  const offending = records.filter(
    (r) => r.kind !== 'usable' || !EVENT_STAGE_TYPES.has(r.recordType)
  );
  if (offending.length > 0) {
    const sample = offending
      .slice(0, 3)
      .map((r) => `${r.id}(${r.kind}/${r.recordType})`)
      .join(', ');
    throw new StoryOfSelfPipelineError(
      stage,
      `${offending.length} non-event record(s) reached an event-only stage: ${sample}`
    );
  }
}

/** Turning-point assessment may only consume canonical events built by clustering. */
export function assertCanonicalEvents(stage: string, events: CanonicalEvent[]): void {
  const offending = events.filter(
    (e) => !e.id || !Array.isArray(e.evidenceIds) || e.evidenceIds.length === 0
  );
  if (offending.length > 0) {
    throw new StoryOfSelfPipelineError(
      stage,
      `${offending.length} record(s) without evidence provenance reached ${stage}`
    );
  }
}

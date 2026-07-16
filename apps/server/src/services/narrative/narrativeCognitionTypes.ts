/**
 * Narrative Cognition Layer — types.
 *
 * Retrieval finds memories; reasoning discovers meaning. These structures are
 * derived views over the narrative graph, never canonical truth: who currently
 * matters, which era the user is living, which arcs are active inside it, and
 * how adjacent events chain into one lived story.
 */
import type { AnchorBuildContext } from './narrativeAnchorTypes';
import type { WorkContext } from '../work/workContextTypes';

/** Question classes that need reasoning over the graph, not retrieval. */
export type CognitionQuestionKind =
  | 'who_matters'
  | 'rising_people'
  | 'current_era'
  | 'active_arcs'
  | 'what_changed'
  | 'attention'
  | 'life_summary'
  | 'struggles';

export type SalienceCategory =
  | 'family'
  | 'partner_or_ex'
  | 'friend'
  | 'coworker'
  | 'mentor'
  | 'community'
  | 'other';

/** Dynamic importance of a person — importance is NOT closeness alone. */
export type PersonSalience = {
  personId: string;
  name: string;
  category: SalienceCategory;
  /** 0..1 — current importance, with time decay applied. */
  score: number;
  /** Human-readable WHY, e.g. "family bond", "mentioned this week". */
  reasonBreakdown: string[];
  trend: 'rising' | 'steady' | 'fading';
  lastUpdated: string;
  confidence: number;
};

export type ActiveArcKind =
  | 'job_onboarding'
  | 'project_build'
  | 'relationship_healing'
  | 'community_distance'
  | 'financial_stability'
  | 'social_confidence'
  | 'health_fitness';

/** A storyline living inside an era. One era contains many arcs. */
export type ActiveArc = {
  id: string;
  kind: ActiveArcKind;
  title: string;
  status: 'active' | 'emerging' | 'resolving';
  /** Short excerpts of the facts/events that support this arc. */
  evidence: string[];
  confidence: number;
};

/** A months-to-years life period. Eras contain arcs, not the reverse. */
export type LifeEra = {
  title: string;
  themes: string[];
  startDateEstimate?: string;
  majorPeople: string[];
  majorPlaces: string[];
  majorProjects: string[];
  arcs: ActiveArc[];
  confidence: number;
};

export type AttentionDomain =
  | 'work'
  | 'projects'
  | 'relationships'
  | 'family'
  | 'social'
  | 'health'
  | 'creative';

/** What currently occupies the user's attention, as a weighted distribution. */
export type AttentionState = {
  domains: Array<{
    domain: AttentionDomain;
    /** 0..1, all domains sum to ~1 when any signal exists. */
    weight: number;
    items: string[];
  }>;
};

export type RecentChange = {
  kind:
    | 'new_organization'
    | 'new_role'
    | 'new_person'
    | 'rising_person'
    | 'fading_person'
    | 'new_arc'
    | 'quieter_community';
  label: string;
  detail?: string;
  confidence: number;
};

export type EventImportanceLevel = 'very_high' | 'high' | 'medium' | 'low';

export type EventImportance = {
  /** 0..1 */
  score: number;
  level: EventImportanceLevel;
  reasons: string[];
};

export type StoryStop = {
  eventId: string;
  title: string;
  startTime?: string;
  placeNames: string[];
  order: number;
};

/** Related same-outing events assembled into ONE story, not N memories. */
export type AssembledStory = {
  id: string;
  title: string;
  stops: StoryStop[];
  peopleIds: string[];
  placeNames: string[];
  startTime?: string;
  endTime?: string;
  importance: EventImportance;
  isMultiStop: boolean;
};

/** Everything the pure resolvers reason over. Built once per question. */
export type NarrativeCognitionContext = {
  graph: AnchorBuildContext;
  work?: WorkContext | null;
  /** entityId → most recent ISO timestamp the entity appeared. */
  recencyByEntity: Map<string, string>;
  /** entityId → ISO timestamp the entity first entered the story. */
  firstSeenByEntity: Map<string, string>;
  /** "now" is injected so resolvers and tests are deterministic. */
  now: string;
};

export type CognitionAnswer = {
  kind: CognitionQuestionKind;
  content: string;
  confidence: number;
  /** Machine-readable trace of WHY — surfaced in metadata, never dumped in chat. */
  reasoning: string[];
};

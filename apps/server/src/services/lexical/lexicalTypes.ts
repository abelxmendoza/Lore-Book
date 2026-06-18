/**
 * Lexical Analyzer — shared types for the pre-ontology signal extraction layer.
 * Signals are candidates, not canonical truth; cognition/provenance confirms writes.
 */

export type LexicalEntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'PLACE'
  | 'PROJECT'
  | 'SKILL'
  | 'ROLE'
  | 'RELATIONSHIP'
  | 'EVENT'
  | 'DATE'
  | 'TIME'
  | 'OBJECT'
  | 'MEDIA'
  | 'EMOTION'
  | 'GOAL'
  | 'CONFLICT'
  | 'IDENTITY_CLAIM'
  | 'PREFERENCE'
  | 'ROUTINE'
  | 'LOCATION_CATEGORY';

export type LexicalIntentKind =
  | 'QUERY'
  | 'ACTION'
  | 'IDENTITY_CLAIM'
  | 'DISAMBIGUATE'
  | 'NAVIGATE'
  | 'CORRECT'
  | 'RECALL'
  | 'STATEMENT';

export type RelationshipRole =
  | 'mother'
  | 'father'
  | 'estranged_father'
  | 'estranged_mother'
  | 'uncle'
  | 'aunt'
  | 'grandmother'
  | 'grandfather'
  | 'sibling'
  | 'cousin'
  | 'friend'
  | 'close_friend'
  | 'ally'
  | 'romantic_partner'
  | 'ex_partner'
  | 'coworker'
  | 'boss'
  | 'mentor'
  | 'student'
  | 'rival'
  | 'acquaintance'
  | 'community_member'
  | 'promoter'
  | 'vendor'
  | 'teammate'
  | 'coach';

export type PlaceCategory =
  | 'restaurant'
  | 'bar'
  | 'night_club'
  | 'music_venue'
  | 'gym'
  | 'dojo'
  | 'school'
  | 'workplace'
  | 'home'
  | 'city'
  | 'neighborhood'
  | 'landmark'
  | 'event_space'
  | 'other';

export type LifeEventKind =
  | 'job_started'
  | 'job_ended'
  | 'promotion'
  | 'interview'
  | 'conflict'
  | 'breakup'
  | 'achievement'
  | 'training'
  | 'travel'
  | 'illness'
  | 'financial_change'
  | 'project_milestone'
  | 'social_event'
  | 'rejection'
  | 'reconciliation'
  | 'learning_moment';

export type HobbyOrPaid = 'hobby' | 'paid' | 'both' | 'unknown';

export type ProficiencyHint = 'beginner' | 'improving' | 'intermediate' | 'advanced' | 'expert' | 'unknown';

export type UsageFrequencyHint = 'daily' | 'weekly' | 'monthly' | 'rarely' | 'unknown';

export type EnjoymentHint = 'low' | 'medium' | 'high' | 'unknown';

export interface LexicalEntity {
  surface: string;
  normalized: string;
  type: LexicalEntityType;
  subcategory?: string;
  startOffset?: number;
  endOffset?: number;
  confidence: number;
  source: string;
}

export interface LexicalIntent {
  kind: LexicalIntentKind;
  cue: string;
  label: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface LexicalEmotion {
  label: string;
  valence: 'positive' | 'negative' | 'mixed' | 'neutral';
  intensity: 'low' | 'medium' | 'high';
  cue: string;
  confidence: number;
}

export interface LexicalRelationshipSignal {
  role: RelationshipRole;
  target?: string;
  cue: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'estranged';
  confidence: number;
}

export interface LexicalSkillSignal {
  name: string;
  category: string;
  hobby_or_paid: HobbyOrPaid;
  proficiency_hint: ProficiencyHint;
  usage_frequency_hint: UsageFrequencyHint;
  enjoyment_hint: EnjoymentHint;
  lore_context: string;
  confidence: number;
}

export interface LexicalPlaceSignal {
  name: string;
  category: PlaceCategory;
  cue: string;
  confidence: number;
}

export interface LexicalEventSignal {
  kind: LifeEventKind;
  subject?: string;
  cue: string;
  confidence: number;
}

export interface GlossaryMatch {
  keyword: string;
  alias: string;
  domain: string;
  category: string;
  subcategory?: string;
  relationshipHint?: string;
  queryHint?: string;
  actionHint?: string;
  surfaceTarget?: string;
  confidence: number;
}

export interface OntologyCandidate {
  predicate: string;
  object: string;
  objectType?: LexicalEntityType;
  confidence: number;
  source: string;
}

export interface MemoryCandidate {
  claim: string;
  category: 'skill' | 'relationship' | 'preference' | 'identity' | 'event' | 'place' | 'general';
  confidence: number;
  requiresConfirmation: boolean;
  source: string;
}

export interface LexicalAnalysisResult {
  messageId: string;
  userId: string;
  threadId?: string;
  rawText: string;
  normalizedText: string;

  entities: LexicalEntity[];
  intents: LexicalIntent[];
  emotions: LexicalEmotion[];
  relationships: LexicalRelationshipSignal[];
  skills: LexicalSkillSignal[];
  places: LexicalPlaceSignal[];
  events: LexicalEventSignal[];

  ontologyCandidates: OntologyCandidate[];
  memoryCandidates: MemoryCandidate[];
  glossaryMatches: GlossaryMatch[];

  /** Typed entity-to-entity links discovered from the message. */
  entityLinks?: import('../ontology/canonical/relationshipKnowledge').DiscoveredEntityLink[];
  /** Inputs clustered by relationship scope (family, work, social, …). */
  relationshipGroups?: import('../ontology/canonical/relationshipKnowledge').RelationshipInputGroup[];

  confidence: number;
  ambiguityFlags: string[];
  needsClarification: boolean;
  createdAt: string;
}

export interface AnalyzeMessageInput {
  userId: string;
  messageId: string;
  text: string;
  threadId?: string;
  timestamp?: string;
}

/** Confidence threshold for auto-queuing memory without user confirmation. */
export const LEXICAL_AUTO_MEMORY_THRESHOLD = 0.85;

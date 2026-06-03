// =====================================================
// UNIFIED EXTRACTION TYPES
// Purpose: Single schema that replaces 10 individual detector contracts.
//          Group A: semantic units, entities, relationships, romantic signals,
//          interests, health, skills, groups, quests, emotional metadata.
// =====================================================

// ─── SEMANTIC LAYER ──────────────────────────────────────────────────────────

export type SemanticUnitType =
  | 'EXPERIENCE'
  | 'FEELING'
  | 'THOUGHT'
  | 'PERCEPTION'
  | 'CLAIM'
  | 'DECISION'
  | 'CORRECTION';

export type TemporalScope = 'PAST' | 'PRESENT' | 'FUTURE' | 'ONGOING';

export interface UnifiedSemanticUnit {
  type: SemanticUnitType;
  content: string;
  confidence: number;
  temporal_scope?: TemporalScope;
  temporal_context?: {
    explicit_date?: string;
    relative_marker?: string;
  };
  themes?: string[];
  emotions?: string[];
}

// ─── ENTITY LAYER ─────────────────────────────────────────────────────────────

export type EntityType = 'PERSON' | 'PLACE' | 'ORGANIZATION' | 'CONCEPT' | 'ANIMAL' | 'OBJECT';

export interface UnifiedEntityAttribute {
  attribute: string;
  value: string;
  confidence: number;
}

export interface UnifiedEntity {
  name: string;
  type: EntityType;
  mention_count: number;
  confidence: number;
  is_self: boolean;
  attributes: UnifiedEntityAttribute[];
  role_in_message?: string;
}

// ─── RELATIONSHIP LAYER ───────────────────────────────────────────────────────

export type RelationshipScope =
  | 'FAMILY'
  | 'ROMANTIC'
  | 'PROFESSIONAL'
  | 'SOCIAL'
  | 'ADVERSARIAL'
  | 'CIRCUMSTANTIAL'
  | 'SELF';

// Canonical vocabulary — single source of truth imported from erSchema.ts.
// All consumers must store and query against these exact strings.
export type CanonicalRelationshipType =
  | 'FRIEND_OF' | 'WORKS_FOR' | 'MENTOR_OF' | 'COACH_OF' | 'SPOUSE_OF'
  | 'ROMANTIC_INTEREST' | 'ACQUAINTANCE' | 'PRESENT_AT' | 'MENTIONED_IN'
  | 'CO_MENTIONED_WITH' | 'PARTICIPATED_IN' | 'INFLUENCED' | 'PRECEDED'
  | 'OVERLAPPED' | 'ENEMY_OF' | 'MENTORS' | 'MENTORED_BY' | 'DATED'
  | 'BROKE_UP_WITH' | 'TRUSTS' | 'DISTRUSTS' | 'LIVES_WITH' | 'VISITED'
  | 'CAUSED' | 'AFFECTED_BY';

export const CANONICAL_RELATIONSHIP_TYPES: CanonicalRelationshipType[] = [
  'FRIEND_OF', 'WORKS_FOR', 'MENTOR_OF', 'COACH_OF', 'SPOUSE_OF',
  'ROMANTIC_INTEREST', 'ACQUAINTANCE', 'PRESENT_AT', 'MENTIONED_IN',
  'CO_MENTIONED_WITH', 'PARTICIPATED_IN', 'INFLUENCED', 'PRECEDED',
  'OVERLAPPED', 'ENEMY_OF', 'MENTORS', 'MENTORED_BY', 'DATED',
  'BROKE_UP_WITH', 'TRUSTS', 'DISTRUSTS', 'LIVES_WITH', 'VISITED',
  'CAUSED', 'AFFECTED_BY',
];

export interface UnifiedEntityRelationship {
  from_entity_name: string;
  to_entity_name: string;
  relationship_type: CanonicalRelationshipType;
  scope: RelationshipScope;
  strength: number;
  confidence: number;
  evidence: string;
}

// ─── ROMANTIC SIGNALS ─────────────────────────────────────────────────────────

export type RomanticSignalType =
  | 'boyfriend' | 'girlfriend' | 'wife' | 'husband'
  | 'fiancé' | 'fiancée' | 'lover' | 'fuck_buddy'
  | 'crush' | 'obsession' | 'infatuation' | 'lust'
  | 'ex_boyfriend' | 'ex_girlfriend' | 'ex_wife' | 'ex_husband' | 'ex_lover'
  | 'situationship' | 'dating' | 'talking' | 'hooking_up'
  | 'one_night_stand' | 'complicated' | 'on_break'
  | 'friends_with_benefits' | 'in_love';

export type RomanticStatus = 'active' | 'on_break' | 'ended' | 'complicated';
export type ExclusivityStatus = 'exclusive' | 'non_exclusive' | 'unknown' | 'complicated';

export interface RomanticDateEvent {
  date_type: string;
  location?: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  was_positive: boolean;
}

export interface UnifiedRomanticSignal {
  person_name: string;
  signal_type: RomanticSignalType;
  status: RomanticStatus;
  exclusivity: ExclusivityStatus;
  is_situationship: boolean;
  confidence: number;
  evidence: string;
  start_date?: string;
  date_event?: RomanticDateEvent;
}

// ─── INTERESTS ────────────────────────────────────────────────────────────────

export type InterestCategory =
  | 'hobby' | 'career' | 'entertainment' | 'learning'
  | 'social' | 'creative' | 'physical' | 'intellectual' | 'other';

export type InterestActionType =
  | 'purchase' | 'research' | 'join' | 'learn' | 'create' | 'share' | 'discuss';

export type KnowledgeDepth = 'surface' | 'moderate' | 'deep' | 'expert';

export interface UnifiedInterest {
  name: string;
  category: InterestCategory;
  confidence: number;
  emotional_intensity: number;
  sentiment: number;
  evidence: string;
  action_taken?: boolean;
  action_type?: InterestActionType;
  knowledge_depth?: KnowledgeDepth;
  time_investment_minutes?: number;
}

// ─── HEALTH SIGNALS ───────────────────────────────────────────────────────────

export type WorkoutType = 'weightlifting' | 'cardio' | 'mixed' | 'other';
export type GymInteractionType = 'met_new' | 'saw_familiar' | 'conversation' | 'romantic_interest';
export type BiometricSource = 'smart_scale' | 'manual' | 'fitness_tracker' | 'other';

export interface WorkoutExercise {
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
  duration_minutes?: number;
  notes?: string;
}

export interface GymSocialInteraction {
  person_name: string;
  interaction_type: GymInteractionType;
  notes?: string;
}

export interface UnifiedWorkoutSignal {
  workout_type: WorkoutType;
  location?: string;
  exercises: WorkoutExercise[];
  total_duration_minutes?: number;
  calories_burned?: number;
  social_interactions?: GymSocialInteraction[];
}

export interface UnifiedBiometricSignal {
  weight?: number;
  body_fat_percentage?: number;
  muscle_mass?: number;
  bmi?: number;
  hydration_percentage?: number;
  bone_mass?: number;
  visceral_fat?: number;
  metabolic_age?: number;
  source: BiometricSource;
}

export interface UnifiedHealthSignals {
  workout?: UnifiedWorkoutSignal;
  biometrics?: UnifiedBiometricSignal;
}

// ─── SKILLS & GROUPS ──────────────────────────────────────────────────────────

export type SkillProficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface UnifiedSkill {
  skill_name: string;
  entity_name: string;
  proficiency?: SkillProficiency;
  evidence: string;
  confidence: number;
}

export type GroupType =
  | 'family' | 'friend_circle' | 'workplace' | 'team'
  | 'community' | 'organization' | 'other';

export interface UnifiedGroup {
  group_name: string;
  group_type: GroupType;
  members: string[];
  user_role?: string;
  evidence: string;
  confidence: number;
}

// ─── QUEST SIGNALS ────────────────────────────────────────────────────────────

export type QuestSignalType = 'GOAL' | 'TASK' | 'CHALLENGE' | 'PROJECT' | 'HABIT';
export type QuestUrgency = 'low' | 'medium' | 'high';

export interface UnifiedQuestSignal {
  type: QuestSignalType;
  title: string;
  description?: string;
  deadline?: string;
  urgency: QuestUrgency;
  evidence: string;
  confidence: number;
}

// ─── EMOTIONAL METADATA ───────────────────────────────────────────────────────

export type NarrativeTone =
  | 'reflective' | 'distressed' | 'hopeful' | 'neutral'
  | 'excited' | 'conflicted' | 'resolved';

export interface EmotionVector {
  emotion: string;
  intensity: number;
}

export interface UnifiedEmotionalMetadata {
  dominant_emotion?: string;
  emotion_vector: EmotionVector[];
  overall_valence: number;
  arousal: number;
  narrative_tone: NarrativeTone;
}

// ─── RECURRENCE HINTS ─────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'recurring' | 'occasional';

export interface UnifiedRecurrenceHint {
  pattern_description: string;
  entity_names: string[];
  frequency_signal: RecurrenceFrequency;
  evidence: string;
  confidence: number;
}

// ─── LOCATIONS ────────────────────────────────────────────────────────────────
// First-class continuity anchors. A location connects people across time —
// "the gym", "home", "work" are recurring narrative positions, not mere strings.

export type LocationType =
  | 'HOME'
  | 'WORK'
  | 'SCHOOL'
  | 'GYM'
  | 'SOCIAL_VENUE'     // bar, restaurant, party
  | 'TRANSIT'          // commute, travel, airport
  | 'HEALTHCARE'       // hospital, clinic, therapy
  | 'OUTDOORS'         // park, trail, beach
  | 'CITY'
  | 'COUNTRY'
  | 'OTHER';

export interface UnifiedLocation {
  name: string;                  // "the gym", "home", "Dr. Reyes' office"
  type: LocationType;
  confidence: number;
  is_named: boolean;             // true if proper noun ("Equinox"), false if generic ("the gym")
  recurring_signal: boolean;     // user implies this place is a regular part of life
  entities_present: string[];    // entity names who were at this location
  evidence: string;
}

// ─── EXTRACTION METADATA ──────────────────────────────────────────────────────

export type MessageComplexity = 'simple' | 'moderate' | 'complex';
export type MessageDomain =
  | 'personal' | 'relationship' | 'professional' | 'health' | 'social' | 'mixed';

// Increment when the payload shape changes in a breaking way.
// Consumers can check this to detect schema drift in shadow logs.
export type ExtractionSchemaVersion = '1.1';

export interface UnifiedExtractionMetadata {
  schema_version: ExtractionSchemaVersion;
  overall_confidence: number;
  message_complexity: MessageComplexity;
  primary_domain: MessageDomain;
  partial_extraction: boolean;
  skipped_fields?: string[];
}

// ─── ROOT PAYLOAD ─────────────────────────────────────────────────────────────

export interface UnifiedExtractionPayload {
  semantic_units: UnifiedSemanticUnit[];
  entities: UnifiedEntity[];
  entity_relationships: UnifiedEntityRelationship[];
  romantic_signals: UnifiedRomanticSignal[];
  interests: UnifiedInterest[];
  health: UnifiedHealthSignals;
  skills: UnifiedSkill[];
  groups: UnifiedGroup[];
  quest_signals: UnifiedQuestSignal[];
  locations: UnifiedLocation[];
  emotional_metadata: UnifiedEmotionalMetadata;
  recurrence_hints: UnifiedRecurrenceHint[];
  extraction_metadata: UnifiedExtractionMetadata;
}

// ─── EVENT POST-PROCESSING (GROUP B) ─────────────────────────────────────────

export type EventImpactType =
  | 'direct_participant'
  | 'indirect_affected'
  | 'related_person_affected'
  | 'observer'
  | 'ripple_effect';

export type EmotionalImpact = 'positive' | 'negative' | 'neutral' | 'mixed';

export type CausalType =
  | 'causes' | 'enables' | 'prevents' | 'triggers'
  | 'follows_from' | 'reaction_to' | 'mitigates'
  | 'amplifies' | 'parallel_to' | 'replaces';

export interface EventImpactResult {
  impact_type: EventImpactType;
  emotional_impact: EmotionalImpact;
  impact_intensity: number;
  description: string;
  confidence: number;
  connection_character_name?: string;
}

export interface EventCausalLinkResult {
  past_event_index: number;
  causal_type: CausalType;
  confidence: number;
  causal_strength: number;
  time_lag_days?: number;
  evidence: string;
}

export interface EventPostProcessingPayload {
  impact: EventImpactResult;
  causal_links: EventCausalLinkResult[];
}

// ─── SHADOW COMPARISON TYPES ──────────────────────────────────────────────────

// Quality metrics — precision/recall/F1 for each signal class
export interface SignalQuality {
  precision: number;
  recall: number;
  f1: number;
}

// Novel discovery — things the merged extractor found that the baseline missed
export interface NovelDiscovery {
  entities: Array<{ name: string; type: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  experiences: Array<{ content: string; confidence: number }>;
}

export interface ShadowComparisonMetrics {
  // ── Quality ────────────────────────────────────────────────────────────────
  entity:           SignalQuality;
  relationship:     SignalQuality;
  romantic_signal:  SignalQuality;
  interest:         SignalQuality;

  // ── Economics ──────────────────────────────────────────────────────────────
  merged_token_count:           number;
  baseline_token_count_estimate: number;
  token_reduction_pct:          number;   // 0–100, positive = cheaper
  merged_call_count:            number;
  baseline_call_count_estimate: number;
  call_reduction_pct:           number;   // 0–100, positive = fewer calls
  merged_latency_ms:            number;
  baseline_latency_estimate_ms: number;   // per-detector serial equivalent
  latency_reduction_pct:        number;   // 0–100, positive = faster

  // ── Discovery ──────────────────────────────────────────────────────────────
  novel: NovelDiscovery;
  novel_entity_count:       number;
  novel_relationship_count: number;
  novel_experience_count:   number;
}

// Verdict for a single threshold criterion
export type ThresholdVerdict = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';

export interface ThresholdCheck {
  metric:    string;
  required:  number;
  actual:    number;
  verdict:   ThresholdVerdict;
}

// Go/no-go report output
export interface ReadinessReport {
  sample_count:        number;
  required_samples:    number;
  ready_for_ab:        boolean;
  hard_blocks:         ThresholdCheck[];    // failing required criteria
  soft_warnings:       ThresholdCheck[];    // passing but below ideal
  passed:              ThresholdCheck[];
  // Economics summary
  avg_token_reduction_pct:   number;
  avg_call_reduction_pct:    number;
  avg_latency_ms:            number;
  // Quality summary
  avg_entity_f1:             number;
  avg_relationship_recall:   number;
  // Discovery summary
  avg_novel_entity_rate:     number;       // novel entities per message
  avg_novel_relationship_rate: number;
  success_rate:              number;
  generated_at:              string;
}

export interface ShadowExtractionLog {
  message_id:              string;
  user_id:                 string;
  merged_extraction:       UnifiedExtractionPayload | null;
  merged_error?:           string;
  baseline_entities:       Array<{ name: string; type: string }>;
  baseline_relationships:  Array<{ from: string; to: string; type: string }>;
  baseline_interests:      Array<{ name: string; category?: string }>;
  baseline_romantic_signals: Array<{ person_name: string; signal_type: string }>;
  baseline_experiences:    Array<{ content: string; type: string }>;
  metrics:                 ShadowComparisonMetrics;
  created_at:              string;
}

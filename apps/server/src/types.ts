export type MemorySource = 'chat' | 'manual' | 'api' | 'system' | 'photo' | 'calendar' | 'x';

export type MemoryEntry = {
  id: string;
  user_id: string;
  date: string;
  content: string;
  tags: string[];
  chapter_id?: string | null;
  mood?: string | null;
  summary?: string | null;
  source: MemorySource;
  metadata?: Record<string, unknown>;
  embedding?: number[] | null;
  similarity?: number;
  created_at?: string;
  updated_at?: string;
};

export type RelationshipTag = 'friend' | 'family' | 'coach' | 'romantic' | 'professional' | 'other';

export type EntryRelationship = {
  name: string;
  tag: RelationshipTag;
};

export type EntryCorrection = {
  id: string;
  corrected_text: string;
  note?: string;
  reason?: string;
  author?: string;
  created_at: string;
};

export type ResolvedMemoryEntry = MemoryEntry & {
  corrections?: EntryCorrection[];
  corrected_content?: string;
  resolution_notes?: string;
};

export type JournalQuery = {
  tag?: string;
  search?: string;
  chapterId?: string;
  from?: string;
  to?: string;
  limit?: number;
  semantic?: boolean;
  threshold?: number;
};

export type MonthGroup = {
  month: string;
  entries: MemoryEntry[];
};

export type Chapter = {
  id: string;
  user_id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ChapterFacet = { label: string; score: number };

export type ChapterProfile = Chapter & {
  entry_ids: string[];
  timeline: MonthGroup[];
  emotion_cloud: ChapterFacet[];
  top_tags: ChapterFacet[];
  chapter_traits: string[];
  featured_people: string[];
  featured_places: string[];
};

export type ChapterCandidate = {
  id: string;
  chapter_title: string;
  start_date: string;
  end_date: string;
  summary: string;
  chapter_traits: string[];
  entry_ids: string[];
  confidence: number;
};

export type ChapterInput = {
  title: string;
  startDate: string;
  endDate?: string | null;
  description?: string | null;
};

export type ChapterTimeline = {
  chapters: (Chapter & { months: MonthGroup[] })[];
  unassigned: MonthGroup[];
};

export type CanonicalRecord = {
  entryId: string;
  date: string;
  canonicalContent: string;
  tags: string[];
  chapterId?: string | null;
  summary?: string | null;
  correctionCount: number;
  lastCorrectedAt?: string;
};

export type CanonicalAlignment = {
  records: CanonicalRecord[];
  chapters: Record<string, { tagSet: string[]; entries: string[] }>;
};

export type LadderRung = {
  label: string;
  start: string;
  end: string;
  entryIds: string[];
  summary: string;
};

export type MemoryLadder = {
  daily: LadderRung[];
  weekly: LadderRung[];
  monthly: LadderRung[];
};

export type MemoryLadderInterval = 'daily' | 'weekly' | 'monthly';

export type MemoryLadderEntry = {
  id: string;
  title: string;
  date: string;
  key_tags: string[];
  emotion_summary?: string | null;
  echoes: string[];
  traits_detected: string[];
  content_preview: string;
  corrected_content?: string;
  summary?: string | null;
  resolution_notes?: string;
  corrections?: EntryCorrection[];
  source: MemorySource;
};

export type MemoryLadderGroup = {
  label: string;
  start: string;
  end: string;
  entries: MemoryLadderEntry[];
};

export type PersonaSnapshot = {
  version: string;
  motifs: string[];
  toneProfile: Record<string, string>;
  behavioralBiases: Record<string, unknown>;
  emotionalVector: Record<string, unknown>;
  description: string;
  lastUpdated: string;
};

export type PersonaHistory = {
  snapshots: PersonaSnapshot[];
};

export type LoreKeeperPrompt = {
  message: string;
  context?: string;
  date?: string;
};


export type EvolutionInsights = {
  personaTitle: string;
  personaTraits: string[];
  toneShift: string;
  emotionalPatterns: string[];
  tagTrends: {
    top: string[];
    rising: string[];
    fading: string[];
  };
  echoes: Array<{ title: string; referenceDate: string; quote?: string }>;
  reminders: string[];
  nextEra: string;
};

export type PeoplePlaceEntity = {
  id: string;
  user_id: string;
  name: string;
  type: 'person' | 'place';
  first_mentioned_at: string;
  last_mentioned_at: string;
  total_mentions: number;
  related_entries: string[];
  corrected_names: string[];
  relationship_counts?: Partial<Record<RelationshipTag, number>>;
};

export type PeoplePlacesStats = {
  total: number;
  people: number;
  places: number;
  mostMentioned: { id: string; name: string; total_mentions: number; type: 'person' | 'place' }[];
  topRelationships: Partial<Record<RelationshipTag, number>>;
};

export type TaskSource = 'chat' | 'manual' | 'microsoft' | 'system';

export type TaskStatus = 'incomplete' | 'completed' | 'deleted';

export type TaskIntent = 'learn' | 'build' | 'fix' | 'buy' | 'plan' | 'contact' | 'capture';

export type TaskCategory =
  | 'robotics'
  | 'finance'
  | 'fitness'
  | 'school'
  | 'home'
  | 'content'
  | 'work'
  | 'admin';

export type TaskRecord = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  category: TaskCategory;
  intent?: TaskIntent | null;
  source: TaskSource;
  status: TaskStatus;
  priority: number;
  urgency: number;
  impact: number;
  effort: number;
  due_date?: string | null;
  external_id?: string | null;
  external_source?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskEvent = {
  id: string;
  user_id: string;
  task_id: string;
  event_type: string;
  description?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export type TaskSyncState = {
  id: string;
  user_id: string;
  provider: string;
  last_cursor?: string | null;
  last_synced_at?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type TimelineEvent = {
  id: string;
  user_id: string;
  task_id?: string | null;
  title: string;
  description?: string | null;
  tags: string[];
  occurred_at: string;
  context?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskMemoryBridge = {
  id: string;
  user_id: string;
  task_id: string;
  timeline_event_id: string;
  journal_entry_id?: string | null;
  bridge_type: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type TaskSuggestion = {
  title: string;
  description?: string;
  category: TaskCategory;
  intent?: TaskIntent | null;
  dueDate?: string | null;
  tags: string[];
  priority: number;
  urgency: number;
  impact: number;
  effort: number;
  confidence: number;
};

export type LocationCoordinates = { lat: number; lng: number };

export type LocationVisit = {
  id: string;
  date: string;
  tags: string[];
  chapter_id?: string | null;
  mood?: string | null;
  summary?: string | null;
  source: MemorySource;
};

export type LocationProfile = {
  id: string;
  name: string;
  visitCount: number;
  firstVisited?: string;
  lastVisited?: string;
  coordinates?: LocationCoordinates | null;
  relatedPeople: { id: string; name: string; total_mentions: number; entryCount: number }[];
  tagCounts: { tag: string; count: number }[];
  chapters: { id: string; title?: string; count: number }[];
  moods: { mood: string; count: number }[];
  entries: LocationVisit[];
  sources: string[];
};

export type MemoryGraphNodeType = 'entry' | 'event' | 'person' | 'place' | 'tag' | 'theme' | 'chapter';

export type MemoryGraphEdgeType =
  | 'co_occurrence'
  | 'emotional'
  | 'frequency'
  | 'sentiment_shift'
  | 'temporal';

export type MemoryGraphNode = {
  id: string;
  type: MemoryGraphNodeType;
  label: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  firstSeen?: string;
  lastSeen?: string;
  sentiments?: {
    score: number;
    samples: string[];
  };
};

export type MemoryGraphEdge = {
  source: string;
  target: string;
  type: MemoryGraphEdgeType;
  weight: number;
  firstSeen: string;
  lastSeen: string;
  recency: number;
  context?: Record<string, unknown>;
};

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  generatedAt: string;
  entryCount?: number;
};

// Truth Seeker and Verification Types
export type VerificationStatus = 'verified' | 'unverified' | 'contradicted' | 'ambiguous';

export type ClaimType = 'date' | 'location' | 'character' | 'event' | 'relationship' | 'attribute' | 'other';

export type FactClaim = {
  id: string;
  user_id: string;
  entry_id: string;
  claim_type: ClaimType;
  subject: string;
  attribute: string;
  value: string;
  confidence: number;
  extracted_at: string;
  metadata?: Record<string, unknown>;
};

export type EntryVerification = {
  id: string;
  user_id: string;
  entry_id: string;
  verification_status: VerificationStatus;
  verified_at: string;
  verified_by: string;
  confidence_score: number;
  evidence_count: number;
  contradiction_count: number;
  supporting_entries: string[];
  contradicting_entries: string[];
  verification_report: Record<string, unknown>;
  resolved: boolean;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  metadata?: Record<string, unknown>;
};

// Memory Engine Types
export type ConversationSession = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at?: string | null;
  title?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ConversationMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type MemoryComponentType =
  | 'event'
  | 'thought'
  | 'reflection'
  | 'decision'
  | 'relationship_update'
  | 'worldbuilding'
  | 'lore_drop'
  | 'timeline_marker';

export type MemoryComponent = {
  id: string;
  journal_entry_id: string;
  component_type: MemoryComponentType;
  text: string;
  characters_involved: string[];
  location?: string | null;
  timestamp?: string | null;
  tags: string[];
  importance_score: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type TimelineLink = {
  id: string;
  component_id: string;
  mythos_id?: string | null;
  epoch_id?: string | null;
  era_id?: string | null;
  saga_id?: string | null;
  arc_id?: string | null;
  chapter_id?: string | null;
  scene_id?: string | null;
  action_id?: string | null;
  micro_action_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

// Service Input Types
export type CreateSessionInput = {
  userId: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type SaveMessageInput = {
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
};

export type ExtractMemoryInput = {
  sessionId: string;
  userId: string;
  immediate?: boolean; // If true, process immediately; otherwise queue for background
};

export type ComponentExtractionResult = {
  components: MemoryComponent[];
  journalEntryId: string;
  extractionConfidence: number;
};

// Knowledge Graph Types
export type GraphEdgeType =
  | 'semantic'
  | 'social'
  | 'thematic'
  | 'narrative'
  | 'temporal'
  | 'emotional'
  | 'character'
  | 'location'
  | 'tag';

export type GraphEdge = {
  id: string;
  source_component_id: string;
  target_component_id: string;
  relationship_type: GraphEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

// Insight Types
export type InsightType =
  | 'pattern'
  | 'correlation'
  | 'cyclic_behavior'
  | 'identity_shift'
  | 'motif'
  | 'prediction'
  | 'trend'
  | 'relationship'
  | 'emotional'
  | 'behavioral';

export type Insight = {
  id: string;
  user_id: string;
  insight_type: InsightType;
  text: string;
  confidence: number;
  source_component_ids: string[];
  source_entry_ids: string[];
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

// Continuity Engine Types
export type ContinuityEventType =
  | 'contradiction'
  | 'abandoned_goal'
  | 'arc_shift'
  | 'identity_drift'
  | 'emotional_transition'
  | 'thematic_drift'
  | 'goal_progress'
  | 'goal_reappearance'
  | 'behavioral_loop';

export type ContinuityEvent = {
  id: string;
  user_id: string;
  event_type: ContinuityEventType;
  description: string;
  source_components: string[];
  severity: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

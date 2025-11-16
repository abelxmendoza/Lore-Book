export type MemorySource = 'chat' | 'manual' | 'api' | 'system' | 'photo' | 'calendar';

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

export type LoreKeeperPrompt = {
  message: string;
  context?: string;
  date?: string;
};

export type MemoryGraphNodeType = 'entry' | 'person' | 'place' | 'event' | 'tag' | 'theme';

export type MemoryGraphNode = {
  id: string;
  type: MemoryGraphNodeType;
  label: string;
  weight: number;
  firstSeen: string;
  lastSeen: string;
  sentiments?: {
    score: number;
    samples: string[];
  };
  meta?: Record<string, unknown>;
};

export type MemoryGraphEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
  reasons: string[];
  lastSeen: string;
  decay: number;
  sentimentImpact?: number;
};

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  generatedAt: string;
  entryCount: number;
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

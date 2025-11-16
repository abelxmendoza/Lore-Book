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

export type LoreKeeperPrompt = {
  message: string;
  context?: string;
  date?: string;
};

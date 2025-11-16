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
  created_at?: string;
  updated_at?: string;
};

export type JournalQuery = {
  tag?: string;
  search?: string;
  chapterId?: string;
  from?: string;
  to?: string;
  limit?: number;
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

export type LoreKeeperPrompt = {
  message: string;
  context?: string;
  date?: string;
};

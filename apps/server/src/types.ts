export type MemorySource = 'chat' | 'manual' | 'api' | 'system';

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

export type LoreKeeperPrompt = {
  message: string;
  context?: string;
  date?: string;
};

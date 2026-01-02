export type MemoryCard = {
  id: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
  mood?: string;
  source: 'journal' | 'x' | 'task' | 'photo' | 'calendar' | 'chat' | 'manual' | 'api' | 'system';
  sourceIcon: string;
  chapterId?: string;
  chapterTitle?: string;
  eraId?: string;
  eraTitle?: string;
  sagaId?: string;
  sagaTitle?: string;
  arcId?: string;
  arcTitle?: string;
  characters: string[];
  linkedMemories?: LinkedMemory[];
};

export type LinkedMemory = {
  id: string;
  title: string;
  date: string;
  linkType: 'era' | 'saga' | 'arc' | 'character' | 'temporal' | 'tag' | 'source';
  linkLabel: string;
  daysDiff?: number;
};

export type MemorySearchResult = {
  type: 'semantic' | 'keyword' | 'cluster';
  memories: MemoryCard[];
  clusterLabel?: string;
  clusterReason?: string;
};

export type MemoryFilters = {
  eras: string[];
  sagas: string[];
  arcs: string[];
  characters: string[];
  sources: string[];
  tags: string[];
  dateFrom?: string;
  dateTo?: string;
};

export function memoryEntryToCard(entry: {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  mood?: string | null;
  chapter_id?: string | null;
  source: string;
  metadata?: Record<string, unknown>;
}): MemoryCard {
  const title = entry.summary || entry.content.substring(0, 60) + (entry.content.length > 60 ? '...' : '');
  const sourceMap: Record<string, 'journal' | 'x' | 'task' | 'photo' | 'calendar' | 'chat' | 'manual' | 'api' | 'system'> = {
    manual: 'journal',
    chat: 'chat',
    x: 'x',
    photo: 'photo',
    calendar: 'calendar',
    api: 'api',
    system: 'system'
  };

  const source = sourceMap[entry.source] || 'journal';
  const sourceIcons: Record<string, string> = {
    journal: '📖',
    x: '🐦',
    task: '✅',
    photo: '📷',
    calendar: '📅',
    chat: '💬',
    manual: '✍️',
    api: '🔌',
    system: '⚙️'
  };

  // Extract characters from metadata relationships
  const characters: string[] = [];
  if (entry.metadata?.relationships && Array.isArray(entry.metadata.relationships)) {
    entry.metadata.relationships.forEach((rel: any) => {
      if (rel.name) characters.push(rel.name);
    });
  }

  return {
    id: entry.id,
    title,
    content: entry.content,
    date: entry.date,
    tags: entry.tags || [],
    mood: entry.mood || undefined,
    source,
    sourceIcon: sourceIcons[source] || '📖',
    chapterId: entry.chapter_id || undefined,
    characters
  };
}


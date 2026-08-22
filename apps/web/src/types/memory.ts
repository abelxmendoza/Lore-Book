import { getDisplayTitle } from '../utils/displayTitle';

export type ContentType = 
  | 'standard'
  | 'testimony'
  | 'advice'
  | 'message_to_reader'
  | 'dedication'
  | 'acknowledgment'
  | 'preface'
  | 'epilogue'
  | 'manifesto'
  | 'vow'
  | 'promise'
  | 'declaration';

export type MemoryCard = {
  id: string;
  title: string;
  content: string;
  /** Occurrence date only. Empty when unresolved — never recording time. */
  date: string;
  occurredAt?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  canonicalEventId?: string | null;
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
  content_type?: ContentType | string | null;
  original_content?: string | null;
  preserve_original_language?: boolean;
  metadata?: Record<string, unknown>;
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

export function memoryOccurrenceIso(memory: Pick<MemoryCard, 'date' | 'occurredAt' | 'occurrenceStatus'>): string | null {
  if (memory.occurrenceStatus === 'unresolved') return null;
  const iso = memory.occurredAt ?? memory.date;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? iso : null;
}

export function compareMemoriesByOccurrence(a: MemoryCard, b: MemoryCard): number {
  const aIso = memoryOccurrenceIso(a);
  const bIso = memoryOccurrenceIso(b);
  if (aIso && bIso) return Date.parse(aIso) - Date.parse(bIso);
  if (aIso) return -1;
  if (bIso) return 1;
  return 0;
}

export function memoryEntryToCard(entry: {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  mood?: string | null;
  chapter_id?: string | null;
  source: string;
  content_type?: ContentType | string | null;
  original_content?: string | null;
  preserve_original_language?: boolean;
  metadata?: Record<string, unknown>;
}): MemoryCard {
  const title = getDisplayTitle({
    title: entry.summary,
    summary: entry.summary,
    content: entry.content,
    date: entry.date,
    source: entry.source,
    fallbackNoun: entry.source === 'chat' ? 'Conversation' : 'Memory',
  });
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
    x: '𝕏',
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
    occurredAt: typeof entry.metadata?.occurredAt === 'string' ? entry.metadata.occurredAt : entry.date,
    mentionedAt: typeof entry.metadata?.mentionedAt === 'string' ? entry.metadata.mentionedAt : null,
    recordedAt: typeof entry.metadata?.recordedAt === 'string' ? entry.metadata.recordedAt : null,
    occurrenceStatus: entry.metadata?.occurrenceStatus === 'unresolved' || entry.metadata?.occurrenceStatus === 'range' || entry.metadata?.occurrenceStatus === 'confirmed'
      ? entry.metadata.occurrenceStatus
      : undefined,
    canonicalEventId: typeof entry.metadata?.canonicalEventId === 'string' ? entry.metadata.canonicalEventId : null,
    tags: entry.tags || [],
    mood: entry.mood || undefined,
    source,
    sourceIcon: sourceIcons[source] || '📖',
    chapterId: entry.chapter_id || undefined,
    characters,
    content_type: entry.content_type,
    original_content: entry.original_content || undefined,
    preserve_original_language: entry.preserve_original_language || false,
    metadata: entry.metadata,
  };
}

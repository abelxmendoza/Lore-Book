import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/api';
import {
  computeLoreReadiness,
  EMPTY_CONTENT_STATS,
  type ContentStatsSnapshot,
  type LoreReadinessSummary,
} from '../lib/loreReadiness';
import { getMockContentStats } from '../mocks/loreReadiness';
import { useShouldUseMockData } from './useShouldUseMockData';

export type CompiledLorebook = {
  id: string;
  title: string;
  lorebook_name?: string;
  created_at: string;
  is_core_lorebook?: boolean;
  chapterCount?: number;
};

type UseLoreReadinessResult = {
  readiness: LoreReadinessSummary | null;
  compiledBooks: CompiledLorebook[];
  loading: boolean;
  refresh: () => Promise<void>;
  hasCompiledBook: boolean;
};

function normalizeStats(raw: Partial<ContentStatsSnapshot> | undefined): ContentStatsSnapshot {
  if (!raw) return EMPTY_CONTENT_STATS;
  return {
    totalJournalEntries: raw.totalJournalEntries ?? 0,
    totalChatMessages: raw.totalChatMessages ?? 0,
    totalNarrativeAtoms: raw.totalNarrativeAtoms ?? 0,
    totalWordCount: raw.totalWordCount ?? 0,
    domainCoverage: raw.domainCoverage ?? [],
    entityCounts: {
      characters: raw.entityCounts?.characters ?? 0,
      locations: raw.entityCounts?.locations ?? 0,
      events: raw.entityCounts?.events ?? 0,
      skills: raw.entityCounts?.skills ?? 0,
    },
  };
}

export function useLoreReadiness(mockPreset: 'sparse' | 'building' | 'rich' = 'rich'): UseLoreReadinessResult {
  const shouldUseMock = useShouldUseMockData();
  const [readiness, setReadiness] = useState<LoreReadinessSummary | null>(null);
  const [compiledBooks, setCompiledBooks] = useState<CompiledLorebook[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let stats = EMPTY_CONTENT_STATS;
      let books: CompiledLorebook[] = [];

      if (shouldUseMock) {
        stats = getMockContentStats(mockPreset);
        books = [
          {
            id: 'demo-1',
            title: 'The Builder Years',
            lorebook_name: 'Career arc',
            created_at: new Date().toISOString(),
            chapterCount: 6,
          },
          {
            id: 'demo-2',
            title: 'Love & Loss in the City',
            lorebook_name: 'Relationships',
            created_at: new Date().toISOString(),
            chapterCount: 4,
          },
        ];
      } else {
        const [statsResult, listResult] = await Promise.allSettled([
          fetchJson<{ stats: ContentStatsSnapshot }>('/api/biography/stats'),
          fetchJson<{ biographies: Array<Record<string, unknown>> }>('/api/biography/list'),
        ]);

        if (statsResult.status === 'fulfilled') {
          stats = normalizeStats(statsResult.value.stats);
        }

        if (listResult.status === 'fulfilled') {
          books = (listResult.value.biographies ?? []).map((row) => {
            const data = (row.biography_data ?? {}) as { title?: string; chapters?: unknown[] };
            return {
              id: String(row.id ?? ''),
              title: String(data.title ?? row.lorebook_name ?? 'Untitled lorebook'),
              lorebook_name: row.lorebook_name as string | undefined,
              created_at: String(row.created_at ?? new Date().toISOString()),
              is_core_lorebook: Boolean(row.is_core_lorebook),
              chapterCount: Array.isArray(data.chapters) ? data.chapters.length : 0,
            };
          }).filter((b) => b.id);
        }
      }

      setReadiness(computeLoreReadiness(stats));
      setCompiledBooks(books);
    } finally {
      setLoading(false);
    }
  }, [shouldUseMock, mockPreset]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    readiness,
    compiledBooks,
    loading,
    refresh: load,
    hasCompiledBook: compiledBooks.length > 0,
  };
}

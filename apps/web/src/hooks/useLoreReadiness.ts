import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/api';
import {
  computeLoreReadiness,
  EMPTY_CONTENT_STATS,
  type ContentStatsSnapshot,
  type LoreReadinessSummary,
} from '../lib/loreReadiness';
import { getMockCompiledBooks } from '../mocks/loreReadiness';
import { useLoreReadinessSimulation } from '../contexts/LoreReadinessSimulationContext';
import { runForgeForPreset } from '../lib/storyForge/forgeReadinessBridge';
import { syncSimulationDemoLibrary } from '../lib/storyForge/demoLorebookWorkflow';
import { resolveDemoLorebookById } from '../lib/storyForge/forgeDemoLibrary';

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
  isSimulated: boolean;
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

function mergeCompiledBooks(
  presetBooks: CompiledLorebook[],
  generatedBooks: CompiledLorebook[],
): CompiledLorebook[] {
  const merged = new Map<string, CompiledLorebook>();
  for (const book of presetBooks) {
    const resolved = resolveDemoLorebookById(book.id);
    merged.set(book.id, {
      ...book,
      title: resolved?.title ?? book.title,
      chapterCount: resolved?.chapters ?? book.chapterCount,
    });
  }
  for (const book of generatedBooks) {
    if (!merged.has(book.id)) {
      merged.set(book.id, book);
    }
  }
  return [...merged.values()];
}

export function useLoreReadiness(): UseLoreReadinessResult {
  const { isSimulating, preset, compiledMode, generatedBooks } = useLoreReadinessSimulation();
  const generatedBooksKey = useMemo(
    () => generatedBooks.map((book) => book.id).join(','),
    [generatedBooks],
  );
  const [readiness, setReadiness] = useState<LoreReadinessSummary | null>(null);
  const [compiledBooks, setCompiledBooks] = useState<CompiledLorebook[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isSimulating) {
        const forge = runForgeForPreset(preset);
        syncSimulationDemoLibrary(compiledMode, generatedBooks);
        const presetBooks = getMockCompiledBooks(compiledMode);
        const books = mergeCompiledBooks(presetBooks, generatedBooks);
        setReadiness(computeLoreReadiness(forge.stats));
        setCompiledBooks(books);
        return;
      }

      let stats = EMPTY_CONTENT_STATS;
      let books: CompiledLorebook[] = [];

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

      setReadiness(computeLoreReadiness(stats));
      setCompiledBooks(books);
    } finally {
      setLoading(false);
    }
  }, [isSimulating, preset, compiledMode, generatedBooksKey, generatedBooks]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    readiness,
    compiledBooks,
    loading,
    refresh: load,
    hasCompiledBook: compiledBooks.length > 0,
    isSimulated: isSimulating,
  };
}

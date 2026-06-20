import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useMockData } from './MockDataContext';
import { getActiveGuestId, getGuestEntries } from '../services/guestLoreStore';
import { fetchJson } from '../lib/api';
import { supabase, useAuth } from '../lib/supabase';
import type { CurrentContext } from '../types/currentContext';
import { MOCK_ENTRIES, MOCK_TIMELINE, MOCK_TAGS, MOCK_CHAPTERS } from '../mocks/journalData';
import {
  useGetEntriesQuery,
  useGetTimelineQuery,
  useGetTimelineTagsQuery,
  useGetChaptersQuery,
  useCreateChapterMutation,
  loreApi,
} from '../store/api/loreApi';
import { useAppDispatch } from '../store/hooks';

export type JournalEntry = {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  mood?: string | null;
  chapter_id?: string | null;
  source: string;
  metadata?: Record<string, unknown>;
};

export type TimelineGroup = {
  month: string;
  entries: JournalEntry[];
};

export type Chapter = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  summary?: string | null;
};

export type TimelineResponse = {
  chapters: (Chapter & { months: TimelineGroup[] })[];
  unassigned: TimelineGroup[];
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
  echoes: { title: string; referenceDate: string; quote?: string }[];
  reminders: string[];
  nextEra: string;
};

export type ChapterFacet = { label: string; score: number };

export type ChapterProfile = Chapter & {
  entry_ids: string[];
  timeline: TimelineGroup[];
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

const EMPTY_TIMELINE: TimelineResponse = { chapters: [], unassigned: [] };

export type LoreKeeperContextValue = ReturnType<typeof useLoreKeeperState>;

const LoreKeeperContext = createContext<LoreKeeperContextValue | null>(null);

/** Internal hook — single instance lives in LoreKeeperProvider. */
function useLoreKeeperState() {
  const dispatch = useAppDispatch();
  const { useMockData: isMockEnabled } = useMockData();
  const { user, loading: authLoading } = useAuth();
  const guestId = getActiveGuestId();

  const skipServerFetch =
    authLoading ||
    isMockEnabled ||
    (!!guestId && !isMockEnabled) ||
    (!user && !isMockEnabled);

  const skipChapters =
    authLoading || isMockEnabled || (!user && !isMockEnabled);

  const {
    data: entriesData,
    refetch: refetchEntriesQuery,
  } = useGetEntriesQuery(undefined, { skip: skipServerFetch });
  const {
    data: timelineData,
    refetch: refetchTimelineQuery,
  } = useGetTimelineQuery(undefined, { skip: skipServerFetch });
  const {
    data: tagsData,
    refetch: refetchTagsQuery,
  } = useGetTimelineTagsQuery(undefined, { skip: skipServerFetch });
  const {
    data: chaptersData,
    refetch: refetchChaptersQuery,
  } = useGetChaptersQuery(undefined, { skip: skipChapters });

  const [createChapterMutation] = useCreateChapterMutation();

  const [cachedEntries] = useState<JournalEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = window.localStorage.getItem('lorekeeper-cache');
    if (!cached) return [];
    try {
      return JSON.parse(cached) as JournalEntry[];
    } catch {
      return [];
    }
  });

  const [answer, setAnswer] = useState('');
  const [reflection, setReflection] = useState('');
  const [searchResults, setSearchResults] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [evolution, setEvolution] = useState<EvolutionInsights | null>(null);

  const hydrateChapter = useCallback(
    (chapter: Chapter): ChapterProfile => ({
      ...chapter,
      entry_ids: [],
      timeline: [],
      emotion_cloud: [],
      top_tags: [],
      chapter_traits: [],
      featured_people: [],
      featured_places: [],
    }),
    []
  );

  const entries = useMemo((): JournalEntry[] => {
    if (guestId && !isMockEnabled) return getGuestEntries(guestId);
    if (isMockEnabled) return MOCK_ENTRIES;
    if (!user && !isMockEnabled) return [];
    return entriesData ?? cachedEntries;
  }, [
    guestId,
    isMockEnabled,
    user,
    entriesData,
    cachedEntries,
  ]);

  const { timeline, tags } = useMemo(() => {
    if (guestId && !isMockEnabled) {
      const guestEntries = getGuestEntries(guestId);
      const byMonth = new Map<string, JournalEntry[]>();
      for (const entry of guestEntries) {
        const month = entry.date.slice(0, 7);
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month)!.push(entry);
      }
      const unassigned = [...byMonth.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, monthEntries]) => ({ month, entries: monthEntries }));
      const tagCounts = new Map<string, number>();
      for (const entry of guestEntries) {
        for (const tag of entry.tags ?? []) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      return {
        timeline: { chapters: [], unassigned } as TimelineResponse,
        tags: [...tagCounts.entries()].map(([name, count]) => ({ name, count })),
      };
    }
    if (!user && !isMockEnabled) {
      return { timeline: EMPTY_TIMELINE, tags: [] as { name: string; count: number }[] };
    }
    if (isMockEnabled) {
      return { timeline: MOCK_TIMELINE, tags: MOCK_TAGS };
    }
    return {
      timeline: timelineData ?? EMPTY_TIMELINE,
      tags: tagsData ?? [],
    };
  }, [guestId, isMockEnabled, user, timelineData, tagsData]);

  const { chapters, chapterCandidates } = useMemo(() => {
    if (!user && !isMockEnabled) {
      return { chapters: [] as ChapterProfile[], chapterCandidates: [] as ChapterCandidate[] };
    }
    if (isMockEnabled) {
      return { chapters: MOCK_CHAPTERS, chapterCandidates: [] as ChapterCandidate[] };
    }
    return {
      chapters: chaptersData?.chapters ?? [],
      chapterCandidates: chaptersData?.candidates ?? [],
    };
  }, [user, isMockEnabled, chaptersData]);

  const refreshEntries = useCallback(async () => {
    if (guestId && !isMockEnabled) return;
    if (!user && !isMockEnabled) return;
    if (isMockEnabled) {
      dispatch(loreApi.util.invalidateTags(['Entry']));
      return;
    }
    await refetchEntriesQuery();
  }, [guestId, isMockEnabled, user, refetchEntriesQuery, dispatch]);

  const refreshTimeline = useCallback(async () => {
    if (guestId && !isMockEnabled) return;
    if (!user && !isMockEnabled) return;
    if (isMockEnabled) {
      dispatch(loreApi.util.invalidateTags(['Timeline']));
      return;
    }
    await Promise.all([refetchTimelineQuery(), refetchTagsQuery()]);
  }, [guestId, isMockEnabled, user, refetchTimelineQuery, refetchTagsQuery, dispatch]);

  const refreshChapters = useCallback(async () => {
    if (!user && !isMockEnabled) return;
    if (isMockEnabled) {
      dispatch(loreApi.util.invalidateTags(['Chapter']));
      return;
    }
    await refetchChaptersQuery();
  }, [isMockEnabled, user, refetchChaptersQuery, dispatch]);

  const refreshEvolution = useCallback(async (refresh = false) => {
    try {
      const url = refresh ? '/api/evolution?refresh=true' : '/api/evolution';
      const data = await fetchJson<{ insights: EvolutionInsights | null }>(url, undefined, {
        useMockData: isMockEnabled,
        mockData: { insights: null },
      });
      setEvolution(data?.insights ?? null);
    } catch (error) {
      console.error('Failed to refresh evolution:', error);
      setEvolution(null);
    }
  }, [isMockEnabled]);

  const createEntry = useCallback(
    async (
      content: string,
      overrides?: Partial<JournalEntry> & {
        tags?: string[];
        chapterId?: string | null;
        metadata?: Record<string, unknown>;
      },
      currentContext?: CurrentContext
    ) => {
      const merged = { ...overrides };
      if (
        currentContext?.kind === 'timeline' &&
        currentContext.timelineLayer === 'chapter' &&
        currentContext.timelineNodeId
      ) {
        (merged as Record<string, unknown>).chapterId = currentContext.timelineNodeId;
      }
      const payload: Record<string, unknown> = { content };
      if (merged && Object.keys(merged).length > 0) {
        if (merged.tags) payload.tags = merged.tags;
        if ('chapter_id' in merged || 'chapterId' in merged) {
          payload.chapterId =
            (merged as Record<string, unknown>).chapterId ?? merged.chapter_id ?? null;
        }
        if (merged.metadata) payload.metadata = merged.metadata;
        const { tags: _tags, chapterId: _chapterId, metadata: _metadata, ...rest } = merged;
        Object.assign(payload, rest);
      }

      let entry: JournalEntry;
      const data = await fetchJson<{ entry: JournalEntry }>('/api/entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, {
        useMockData: isMockEnabled,
      });
      entry = data.entry;
      dispatch(loreApi.util.invalidateTags(['Entry', 'Timeline']));

      if (currentContext?.kind === 'thread' && currentContext.threadId) {
        try {
          await fetchJson<{ entry_id: string; thread_id: string }>(
            `/api/threads/${currentContext.threadId}/entries`,
            {
              method: 'POST',
              body: JSON.stringify({ entry_id: entry.id }),
            }
          );
        } catch (e) {
          console.warn('Failed to link entry to thread:', e);
        }
      }
      return entry;
    },
    [dispatch, guestId, isMockEnabled, user]
  );

  const askLoreKeeper = useCallback(async (message: string, persona?: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message, persona }),
      });
      setAnswer(data.answer);
      return data.answer;
    } finally {
      setLoading(false);
    }
  }, []);

  const reflect = useCallback(
    async (payload: {
      mode: 'entry' | 'month' | 'advice';
      entryId?: string;
      month?: string;
      persona?: string;
      prompt?: string;
    }) => {
      const data = await fetchJson<{ reflection: string }>(`/api/summary/reflect`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setReflection(data.reflection);
      return data.reflection;
    },
    []
  );

  const semanticSearch = useCallback(async (search: string, semantic = false) => {
    const params = new URLSearchParams({ search });
    if (semantic) params.set('semantic', 'true');
    const data = await fetchJson<{ entries: JournalEntry[] }>(`/api/entries?${params.toString()}`);
    setSearchResults(data.entries);
    return data.entries;
  }, []);

  const uploadVoiceEntry = useCallback(async (file: File) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const form = new FormData();
    form.append('audio', file);

    const res = await fetch('/api/entries/voice', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error ?? 'Failed to upload voice note');
    }

    const parsed = await res.json();
    dispatch(loreApi.util.invalidateTags(['Entry', 'Timeline']));
    return parsed.entry as JournalEntry;
  }, [dispatch]);

  const summarize = useCallback(async (from: string, to: string) => {
    const data = await fetchJson<{ summary: string; entryCount: number }>('/api/summary', {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    });
    return data;
  }, []);

  const createChapter = useCallback(
    async (payload: {
      title: string;
      startDate: string;
      endDate?: string | null;
      description?: string | null;
    }) => {
      if (isMockEnabled || !user) {
        const data = await fetchJson<{ chapter: Chapter }>('/api/chapters', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        dispatch(loreApi.util.invalidateTags(['Chapter', 'Timeline']));
        return data.chapter;
      }
      const chapter = await createChapterMutation({
        title: payload.title,
        start_date: payload.startDate,
        end_date: payload.endDate ?? undefined,
      }).unwrap();
      return chapter;
    },
    [createChapterMutation, dispatch, isMockEnabled, user]
  );

  const summarizeChapter = useCallback(async (chapterId: string) => {
    const data = await fetchJson<{ summary: string }>(`/api/chapters/${chapterId}/summary`, {
      method: 'POST',
    });
    return data.summary;
  }, []);

  const prevMock = useRef(isMockEnabled);
  useEffect(() => {
    if (prevMock.current === isMockEnabled) return;
    prevMock.current = isMockEnabled;
    dispatch(loreApi.util.invalidateTags(['Entry', 'Timeline', 'Chapter']));
  }, [isMockEnabled, dispatch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (entries && Array.isArray(entries) && entries.length > 0) {
      window.localStorage.setItem('lorekeeper-cache', JSON.stringify(entries.slice(0, 10)));
    }
  }, [entries]);

  const timelineCount = useMemo(() => {
    if (!timeline) return 0;
    const chapterList = timeline.chapters || [];
    const unassigned = timeline.unassigned || [];
    const chapterCount = chapterList.reduce(
      (acc, chapter) =>
        acc + (chapter.months?.reduce((chapterAcc, group) => chapterAcc + (group.entries?.length || 0), 0) || 0),
      0
    );
    const unassignedCount = unassigned.reduce((acc, group) => acc + (group.entries?.length || 0), 0);
    return chapterCount + unassignedCount;
  }, [timeline]);

  return {
    entries,
    timeline,
    tags,
    timelineCount,
    chapters,
    answer,
    reflection,
    evolution,
    chapterCandidates,
    searchResults,
    askLoreKeeper,
    createEntry,
    createChapter,
    reflect,
    semanticSearch,
    uploadVoiceEntry,
    refreshEntries,
    refreshTimeline,
    refreshChapters,
    refreshEvolution,
    summarize,
    summarizeChapter,
    loading,
  };
}

export function LoreKeeperProvider({ children }: { children: ReactNode }) {
  const value = useLoreKeeperState();
  return <LoreKeeperContext.Provider value={value}>{children}</LoreKeeperContext.Provider>;
}

export function useLoreKeeper(): LoreKeeperContextValue {
  const ctx = useContext(LoreKeeperContext);
  if (!ctx) {
    throw new Error('useLoreKeeper must be used within LoreKeeperProvider');
  }
  return ctx;
}

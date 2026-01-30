import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMockData } from '../contexts/MockDataContext';
import { fetchJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { CurrentContext } from '../types/currentContext';

export type JournalEntry = {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  mood?: string | null;
  chapter_id?: string | null;
  source: string;
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

export const useLoreKeeper = () => {
  const { useMockData: isMockEnabled } = useMockData();
  const [entries, setEntries] = useState<JournalEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = window.localStorage.getItem('lorekeeper-cache');
    if (!cached) return [];
    try {
      return JSON.parse(cached) as JournalEntry[];
    } catch {
      return [];
    }
  });
  const [timeline, setTimeline] = useState<TimelineResponse>({ chapters: [], unassigned: [] });
  const [chapters, setChapters] = useState<ChapterProfile[]>([]);
  const [chapterCandidates, setChapterCandidates] = useState<ChapterCandidate[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
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
      featured_places: []
    }),
    []
  );

  const refreshEntries = useCallback(async () => {
    try {
      const data = await fetchJson<{ entries: JournalEntry[] }>('/api/entries', undefined, {
        isMockEnabled,
        mockData: { entries: [] },
      });
      setEntries(data?.entries || []);
    } catch (error) {
      console.error('Failed to refresh entries:', error);
      setEntries([]);
    }
  }, [isMockEnabled]);

  const refreshTimeline = useCallback(async () => {
    try {
      const [timelineData, tagData] = await Promise.all([
        fetchJson<{ timeline: TimelineResponse }>('/api/timeline', undefined, {
          isMockEnabled,
          mockData: { timeline: EMPTY_TIMELINE },
        }),
        fetchJson<{ tags: { name: string; count: number }[] }>('/api/timeline/tags', undefined, {
          isMockEnabled,
          mockData: { tags: [] },
        }),
      ]);
      setTimeline(timelineData?.timeline || EMPTY_TIMELINE);
      setTags(tagData?.tags || []);
    } catch (error) {
      console.error('Failed to refresh timeline:', error);
      setTimeline(EMPTY_TIMELINE);
      setTags([]);
    }
  }, [isMockEnabled]);

  const refreshChapters = useCallback(async () => {
    try {
      const data = await fetchJson<{ chapters: ChapterProfile[]; candidates?: ChapterCandidate[] }>('/api/chapters', undefined, {
        isMockEnabled,
        mockData: { chapters: [], candidates: [] },
      });
      setChapters(data?.chapters ?? []);
      setChapterCandidates(data?.candidates ?? []);
    } catch (error) {
      console.error('Failed to refresh chapters:', error);
      setChapters([]);
      setChapterCandidates([]);
    }
  }, [isMockEnabled]);

  const refreshEvolution = useCallback(async () => {
    try {
      const data = await fetchJson<{ insights: EvolutionInsights | null }>('/api/evolution', undefined, {
        isMockEnabled,
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
      overrides?: Partial<JournalEntry> & { tags?: string[]; chapterId?: string | null; metadata?: Record<string, unknown> },
      currentContext?: CurrentContext
    ) => {
      const merged = { ...overrides };
      if (currentContext?.kind === 'timeline' && currentContext.timelineLayer === 'chapter' && currentContext.timelineNodeId) {
        (merged as Record<string, unknown>).chapterId = currentContext.timelineNodeId;
      }
      const payload: Record<string, unknown> = { content };
      if (merged && Object.keys(merged).length > 0) {
        if (merged.tags) payload.tags = merged.tags;
        if ('chapter_id' in merged || 'chapterId' in merged) {
          payload.chapterId = (merged as Record<string, unknown>).chapterId ?? merged.chapter_id ?? null;
        }
        if (merged.metadata) payload.metadata = merged.metadata;
        const { tags, chapterId, metadata, ...rest } = merged;
        Object.assign(payload, rest);
      }
      const data = await fetchJson<{ entry: JournalEntry }>('/api/entries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setEntries((prev) => [data.entry, ...prev]);
      if (currentContext?.kind === 'thread' && currentContext.threadId) {
        try {
          await fetchJson<{ entry_id: string; thread_id: string }>(`/api/threads/${currentContext.threadId}/entries`, {
            method: 'POST',
            body: JSON.stringify({ entry_id: data.entry.id })
          });
        } catch (e) {
          console.warn('Failed to link entry to thread:', e);
        }
      }
      return data.entry;
    },
    []
  );

  const askLoreKeeper = useCallback(async (message: string, persona?: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message, persona })
      });
      setAnswer(data.answer);
      return data.answer;
    } finally {
      setLoading(false);
    }
  }, []);

  const reflect = useCallback(
    async (payload: { mode: 'entry' | 'month' | 'advice'; entryId?: string; month?: string; persona?: string; prompt?: string }) => {
      const data = await fetchJson<{ reflection: string }>(`/api/summary/reflect`, {
        method: 'POST',
        body: JSON.stringify(payload)
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
      body: form
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error ?? 'Failed to upload voice note');
    }

    const parsed = await res.json();
    setEntries((prev) => [parsed.entry, ...prev]);
    return parsed.entry as JournalEntry;
  }, []);

  const summarize = useCallback(async (from: string, to: string) => {
    const data = await fetchJson<{ summary: string; entryCount: number }>('/api/summary', {
      method: 'POST',
      body: JSON.stringify({ from, to })
    });
    return data;
  }, []);

  const createChapter = useCallback(
    async (payload: { title: string; startDate: string; endDate?: string | null; description?: string | null }) => {
      const data = await fetchJson<{ chapter: Chapter }>('/api/chapters', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setChapters((prev) => [hydrateChapter(data.chapter), ...prev]);
      return data.chapter;
    },
    [hydrateChapter]
  );

  const summarizeChapter = useCallback(async (chapterId: string) => {
    const data = await fetchJson<{ summary: string }>(`/api/chapters/${chapterId}/summary`, {
      method: 'POST'
    });
    return data.summary;
  }, []);

  useEffect(() => {
    void refreshEntries().catch(err => console.error('Failed to refresh entries on mount:', err));
    void refreshTimeline().catch(err => console.error('Failed to refresh timeline on mount:', err));
    void refreshChapters().catch(err => console.error('Failed to refresh chapters on mount:', err));
    void refreshEvolution().catch(err => console.error('Failed to refresh evolution on mount:', err));
  }, [refreshEntries, refreshTimeline, refreshChapters, refreshEvolution]);

  // When mock is auto-enabled (backend down), refetch once so we get mock data without errors
  const prevMock = useRef(isMockEnabled);
  useEffect(() => {
    if (prevMock.current === isMockEnabled) return;
    prevMock.current = isMockEnabled;
    if (!isMockEnabled) return;
    void refreshEntries().catch(() => {});
    void refreshTimeline().catch(() => {});
    void refreshChapters().catch(() => {});
    void refreshEvolution().catch(() => {});
  }, [isMockEnabled, refreshEntries, refreshTimeline, refreshChapters, refreshEvolution]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (entries && Array.isArray(entries) && entries.length > 0) {
      window.localStorage.setItem('lorekeeper-cache', JSON.stringify(entries.slice(0, 10)));
    }
  }, [entries]);

  const timelineCount = useMemo(() => {
    if (!timeline) return 0;
    const chapters = timeline.chapters || [];
    const unassigned = timeline.unassigned || [];
    const chapterCount = chapters.reduce(
      (acc, chapter) => acc + (chapter.months?.reduce((chapterAcc, group) => chapterAcc + (group.entries?.length || 0), 0) || 0),
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
    loading
  };
};

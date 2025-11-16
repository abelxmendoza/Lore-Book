import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

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

export type TimelineResponse = {
  chapters: (Chapter & { months: TimelineGroup[] })[];
  unassigned: TimelineGroup[];
};

const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...init
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Request failed');
  }
  return res.json();
};

export const useLoreKeeper = () => {
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
    const data = await fetchJson<{ entries: JournalEntry[] }>('/api/entries');
    setEntries(data.entries);
  }, []);

  const refreshTimeline = useCallback(async () => {
    const [timelineData, tagData] = await Promise.all([
      fetchJson<{ timeline: TimelineResponse }>('/api/timeline'),
      fetchJson<{ tags: { name: string; count: number }[] }>('/api/timeline/tags')
    ]);
    setTimeline(timelineData.timeline);
    setTags(tagData.tags);
  }, []);

  const refreshChapters = useCallback(async () => {
    const data = await fetchJson<{ chapters: ChapterProfile[]; candidates?: ChapterCandidate[] }>('/api/chapters');
    setChapters(data.chapters);
    setChapterCandidates(data.candidates ?? []);
  }, []);

  const createEntry = useCallback(async (content: string, overrides?: Partial<JournalEntry>) => {
    const payload: Record<string, unknown> = { content };
    if (overrides) {
      Object.assign(payload, overrides);
      if ('chapter_id' in overrides || 'chapterId' in overrides) {
        payload.chapterId = (overrides as Record<string, unknown>).chapterId ?? overrides.chapter_id ?? null;
      }
    }
    const data = await fetchJson<{ entry: JournalEntry }>('/api/entries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setEntries((prev) => [data.entry, ...prev]);
    return data.entry;
  }, []);

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
    refreshEntries();
    refreshTimeline();
    refreshChapters();
  }, [refreshEntries, refreshTimeline, refreshChapters]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('lorekeeper-cache', JSON.stringify(entries.slice(0, 10)));
  }, [entries]);

  const timelineCount = useMemo(() => {
    const chapterCount = timeline.chapters.reduce(
      (acc, chapter) => acc + chapter.months.reduce((chapterAcc, group) => chapterAcc + group.entries.length, 0),
      0
    );
    const unassignedCount = timeline.unassigned.reduce((acc, group) => acc + group.entries.length, 0);
    return chapterCount + unassignedCount;
  }, [timeline]);

  return {
    entries,
    timeline,
    tags,
    timelineCount,
    chapters,
    chapterCandidates,
    answer,
    reflection,
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
    summarize,
    summarizeChapter,
    loading
  };
};

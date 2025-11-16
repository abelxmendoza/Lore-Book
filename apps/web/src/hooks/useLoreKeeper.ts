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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

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
    const data = await fetchJson<{ chapters: Chapter[] }>('/api/chapters');
    setChapters(data.chapters);
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

  const askLoreKeeper = useCallback(async (message: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      setAnswer(data.answer);
      return data.answer;
    } finally {
      setLoading(false);
    }
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
      setChapters((prev) => [data.chapter, ...prev]);
      return data.chapter;
    },
    []
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
    answer,
    askLoreKeeper,
    createEntry,
    createChapter,
    refreshEntries,
    refreshTimeline,
    refreshChapters,
    summarize,
    summarizeChapter,
    loading
  };
};

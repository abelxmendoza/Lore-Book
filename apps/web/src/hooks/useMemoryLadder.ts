import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../lib/api';

export type MemoryLadderEntry = {
  id: string;
  title: string;
  date: string;
  key_tags: string[];
  emotion_summary?: string | null;
  echoes: string[];
  traits_detected: string[];
  content_preview: string;
  corrected_content?: string;
  summary?: string | null;
  resolution_notes?: string;
  corrections?: { id: string; corrected_text: string; note?: string; reason?: string; created_at: string }[];
  source: string;
};

export type MemoryLadderGroup = {
  label: string;
  start: string;
  end: string;
  entries: MemoryLadderEntry[];
};

export type MemoryLadderResponse = {
  interval: 'daily' | 'weekly' | 'monthly';
  groups: MemoryLadderGroup[];
};

export type MemoryLadderFilters = {
  interval: MemoryLadderResponse['interval'];
  persona?: string;
  tag?: string;
  emotion?: string;
};

export const useMemoryLadder = (initialInterval: MemoryLadderResponse['interval'] = 'weekly') => {
  const [ladder, setLadder] = useState<MemoryLadderResponse>({ interval: initialInterval, groups: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: MemoryLadderFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ interval: filters.interval });
      if (filters.persona) params.set('persona', filters.persona);
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.emotion) params.set('emotion', filters.emotion);
      const data = await fetchJson<{ ladder: MemoryLadderResponse }>(`/api/memory-ladder?${params.toString()}`);
      setLadder(data.ladder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ladder');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ interval: initialInterval });
  }, [initialInterval, load]);

  return { ladder, loading, error, load };
};

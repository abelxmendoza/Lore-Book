import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';

// Dummy data for UI development
const getDummyEntries = (): TimelineEntry[] => {
  const now = new Date();
  const entries: TimelineEntry[] = [];
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 2);
    
    const lanes = ['life', 'robotics', 'mma', 'work', 'creative'];
    const moods = ['happy', 'excited', 'anxious', 'calm', 'angry', 'sad'];
    const lane = lanes[i % lanes.length];
    const mood = moods[i % moods.length];
    
    entries.push({
      id: `dummy-entry-${i}`,
      timestamp: date.toISOString(),
      title: `Memory ${i + 1}: ${lane.charAt(0).toUpperCase() + lane.slice(1)} Activity`,
      summary: `This is a sample memory entry for ${lane} activities. It demonstrates how entries appear on the timeline.`,
      full_text: `Full content of memory ${i + 1}. This is a longer description that would contain the complete journal entry text.`,
      mood: mood,
      arc: i % 3 === 0 ? 'dummy-arc-1' : null,
      saga: i % 5 === 0 ? 'dummy-saga-1' : null,
      era: i % 10 === 0 ? 'dummy-era-1' : null,
      lane: lane,
      tags: [lane, mood, `tag-${i % 5}`],
      character_ids: i % 4 === 0 ? ['dummy-char-1'] : [],
      related_entry_ids: i > 0 && i % 3 === 0 ? [`dummy-entry-${i - 1}`] : []
    });
  }
  
  return entries;
};

const getDummyEras = (): TimelineBand[] => {
  const now = new Date();
  return [
    {
      id: 'dummy-era-1',
      name: 'The Learning Era',
      start_date: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 6, 30).toISOString(),
      color: '#4a148c',
      type: 'era'
    },
    {
      id: 'dummy-era-2',
      name: 'The Growth Era',
      start_date: new Date(now.getFullYear() - 1, 7, 1).toISOString(),
      end_date: null,
      color: '#4a148c',
      type: 'era'
    }
  ];
};

const getDummySagas = (): TimelineBand[] => {
  const now = new Date();
  return [
    {
      id: 'dummy-saga-1',
      name: 'Robotics Journey',
      start_date: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 11, 31).toISOString(),
      color: '#b71c1c',
      type: 'saga'
    },
    {
      id: 'dummy-saga-2',
      name: 'Martial Arts Training',
      start_date: new Date(now.getFullYear(), 0, 1).toISOString(),
      end_date: null,
      color: '#b71c1c',
      type: 'saga'
    }
  ];
};

const getDummyArcs = (): TimelineBand[] => {
  const now = new Date();
  return [
    {
      id: 'dummy-arc-1',
      name: 'Project Alpha',
      start_date: new Date(now.getFullYear() - 1, 2, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 5, 30).toISOString(),
      color: '#1e88e5',
      type: 'arc'
    },
    {
      id: 'dummy-arc-2',
      name: 'Creative Exploration',
      start_date: new Date(now.getFullYear() - 1, 8, 1).toISOString(),
      end_date: new Date(now.getFullYear() - 1, 11, 31).toISOString(),
      color: '#1e88e5',
      type: 'arc'
    },
    {
      id: 'dummy-arc-3',
      name: 'Current Focus',
      start_date: new Date(now.getFullYear(), 0, 1).toISOString(),
      end_date: null,
      color: '#1e88e5',
      type: 'arc'
    }
  ];
};

export type TimelineEntry = {
  id: string;
  timestamp: string;
  title: string;
  summary: string;
  full_text: string;
  mood: string | null;
  arc: string | null;
  saga: string | null;
  era: string | null;
  lane: string;
  tags: string[];
  character_ids: string[];
  related_entry_ids: string[];
};

export type TimelineBand = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  color: string;
  type: 'era' | 'saga' | 'arc';
};

export type TimelineFilters = {
  era?: string[];
  saga?: string[];
  arc?: string[];
  lane?: string[];
  mood?: string[];
  search?: string;
};

export const useTimelineData = () => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [eras, setEras] = useState<TimelineBand[]>([]);
  const [sagas, setSagas] = useState<TimelineBand[]>([]);
  const [arcs, setArcs] = useState<TimelineBand[]>([]);
  const [filters, setFilters] = useState<TimelineFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (filters.era && filters.era.length > 0) {
        filters.era.forEach(e => params.append('era', e));
      }
      if (filters.saga && filters.saga.length > 0) {
        filters.saga.forEach(s => params.append('saga', s));
      }
      if (filters.arc && filters.arc.length > 0) {
        filters.arc.forEach(a => params.append('arc', a));
      }
      if (filters.lane && filters.lane.length > 0) {
        filters.lane.forEach(l => params.append('lane', l));
      }
      if (filters.mood && filters.mood.length > 0) {
        filters.mood.forEach(m => params.append('mood', m));
      }
      if (filters.search) {
        params.append('search', filters.search);
      }

      const [entriesRes, erasRes, sagasRes, arcsRes] = await Promise.allSettled([
        fetchJson<{ entries: TimelineEntry[] }>(`/api/timeline/entries?${params.toString()}`),
        fetchJson<{ eras: TimelineBand[] }>('/api/timeline/eras'),
        fetchJson<{ sagas: TimelineBand[] }>('/api/timeline/sagas'),
        fetchJson<{ arcs: TimelineBand[] }>('/api/timeline/arcs')
      ]);

      // Handle each response, defaulting to empty arrays on failure
      const fetchedEntries = entriesRes.status === 'fulfilled' 
        ? (entriesRes.value.entries || [])
        : [];
      const fetchedEras = erasRes.status === 'fulfilled'
        ? (erasRes.value.eras || [])
        : [];
      const fetchedSagas = sagasRes.status === 'fulfilled'
        ? (sagasRes.value.sagas || [])
        : [];
      const fetchedArcs = arcsRes.status === 'fulfilled'
        ? (arcsRes.value.arcs || [])
        : [];

      // Use dummy data if all requests failed or returned empty
      const allEmpty = fetchedEntries.length === 0 && fetchedEras.length === 0 && 
                      fetchedSagas.length === 0 && fetchedArcs.length === 0;
      
      if (allEmpty) {
        // Use dummy data and don't set error - this is expected for UI development
        setEntries(getDummyEntries());
        setEras(getDummyEras());
        setSagas(getDummySagas());
        setArcs(getDummyArcs());
        setError(null); // Clear error when using dummy data
      } else {
        setEntries(fetchedEntries);
        setEras(fetchedEras);
        setSagas(fetchedSagas);
        setArcs(fetchedArcs);
        setError(null); // Clear error when we have real data
      }
    } catch (err) {
      console.error('Failed to fetch timeline data:', err);
      // Use dummy data as fallback instead of showing error
      setEntries(getDummyEntries());
      setEras(getDummyEras());
      setSagas(getDummySagas());
      setArcs(getDummyArcs());
      setError(null); // Don't show error when using dummy data
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: Partial<TimelineFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    entries,
    eras,
    sagas,
    arcs,
    filters,
    setFilters: updateFilters,
    resetFilters,
    loading,
    error,
    refetch: fetchData
  };
};


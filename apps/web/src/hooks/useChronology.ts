import { useState, useEffect, useCallback } from 'react';
import type { ChronologyEntry, ChronologyOverlap, TimeBucket, Timeline } from '../types/timelineV2';
import { fetchChronology, fetchChronologyOverlaps, fetchTimeBuckets } from '../api/timelineV2';
import { mockDataService } from '../services/mockDataService';
import { subscribeToMockDataState } from '../contexts/MockDataContext';

export const useChronology = (startTime?: string, endTime?: string, timelineIds?: string[]) => {
  const [entries, setEntries] = useState<ChronologyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadChronology = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let response;
      try {
        response = await fetchChronology(startTime, endTime, timelineIds);
      } catch (err) {
        // If API fails, use mock data if enabled
        const mockData = mockDataService.getWithFallback.chronologyEntries(null);
        if (mockData.metadata.isMock) {
          console.warn('Chronology API failed, using mock data:', err);
          response = { entries: mockData.data };
        } else {
          throw err;
        }
      }
      
      // Use centralized mock data service
      const result = mockDataService.getWithFallback.chronologyEntries(response.entries || []);
      
      // Filter by timeline if specified
      let filteredEntries = result.data;
      if (timelineIds && timelineIds.length > 0) {
        filteredEntries = filteredEntries.filter(e => 
          e.timeline_memberships?.some(id => timelineIds.includes(id))
        );
      }
      
      // Filter by time range if specified
      if (startTime || endTime) {
        filteredEntries = filteredEntries.filter(e => {
          const entryTime = new Date(e.start_time).getTime();
          const start = startTime ? new Date(startTime).getTime() : -Infinity;
          const end = endTime ? new Date(endTime).getTime() : Infinity;
          return entryTime >= start && entryTime <= end;
        });
      }
      
      setEntries(filteredEntries);
      
      // Clear error if using mock data
      if (result.metadata.isMock) {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load chronology'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime, timelineIds]);

  useEffect(() => {
    loadChronology();
  }, [loadChronology]);

  // Refresh when mock data toggle changes
  useEffect(() => {
    const unsubscribe = subscribeToMockDataState(() => {
      loadChronology();
    });
    return unsubscribe;
  }, [loadChronology]);

  return { entries, loading, error, refetch: loadChronology };
};

export const useChronologyOverlaps = (entryId?: string) => {
  const [overlaps, setOverlaps] = useState<ChronologyOverlap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadOverlaps = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchChronologyOverlaps(entryId);
        setOverlaps(response.overlaps);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load overlaps'));
      } finally {
        setLoading(false);
      }
    };

    loadOverlaps();
  }, [entryId]);

  return { overlaps, loading, error };
};

export const useTimeBuckets = (resolution: 'decade' | 'year' | 'month' = 'year') => {
  const [buckets, setBuckets] = useState<TimeBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadBuckets = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchTimeBuckets(resolution);
        setBuckets(response.buckets);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load time buckets'));
      } finally {
        setLoading(false);
      }
    };

    loadBuckets();
  }, [resolution]);

  return { buckets, loading, error };
};

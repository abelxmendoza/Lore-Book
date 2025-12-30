import { useState, useEffect, useCallback } from 'react';
import type { ChronologyEntry, ChronologyOverlap, TimeBucket, Timeline } from '../types/timelineV2';
import { fetchChronology, fetchChronologyOverlaps, fetchTimeBuckets } from '../api/timelineV2';
import { generateMockChronologyEntries, generateMockTimelines } from '../mocks/timelineMockData';
import { config } from '../config/env';

export const useChronology = (startTime?: string, endTime?: string, timelineIds?: string[]) => {
  const [entries, setEntries] = useState<ChronologyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadChronology = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchChronology(startTime, endTime, timelineIds);
      
      // Use mock data if response is empty and mock data is enabled
      if ((!response.entries || response.entries.length === 0) && config.dev.allowMockData) {
        // Generate timelines first, then entries linked to them
        const mockTimelines = generateMockTimelines();
        const mockEntries = generateMockChronologyEntries(mockTimelines);
        
        // Filter by timeline if specified
        let filteredEntries = mockEntries;
        if (timelineIds && timelineIds.length > 0) {
          filteredEntries = mockEntries.filter(e => 
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
      } else {
        setEntries(response.entries);
      }
    } catch (err) {
      // Use mock data on error if enabled
      if (config.dev.allowMockData) {
        console.warn('Chronology API failed, using mock data:', err);
        // Generate timelines first, then entries linked to them
        const mockTimelines = generateMockTimelines();
        const mockEntries = generateMockChronologyEntries(mockTimelines);
        
        // Apply filters
        let filteredEntries = mockEntries;
        if (timelineIds && timelineIds.length > 0) {
          filteredEntries = mockEntries.filter(e => 
            e.timeline_memberships?.some(id => timelineIds.includes(id))
          );
        }
        if (startTime || endTime) {
          filteredEntries = filteredEntries.filter(e => {
            const entryTime = new Date(e.start_time).getTime();
            const start = startTime ? new Date(startTime).getTime() : -Infinity;
            const end = endTime ? new Date(endTime).getTime() : Infinity;
            return entryTime >= start && entryTime <= end;
          });
        }
        
        setEntries(filteredEntries);
        setError(null); // Don't show error when using mock data
      } else {
        setError(err instanceof Error ? err : new Error('Failed to load chronology'));
      }
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime, timelineIds]);

  useEffect(() => {
    loadChronology();
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

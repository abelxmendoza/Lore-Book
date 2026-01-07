import { useState, useEffect, useCallback } from 'react';
import type { Timeline, TimelineMembership, ChronologyEntry } from '../types/timelineV2';
import {
  fetchTimelines,
  fetchTimeline,
  createTimeline as createTimelineApi,
  updateTimeline as updateTimelineApi,
  deleteTimeline as deleteTimelineApi,
  fetchTimelineMemberships,
  addMemoryToTimeline as addMemoryToTimelineApi,
  removeMemoryFromTimeline as removeMemoryFromTimelineApi
} from '../api/timelineV2';
import { mockDataService } from '../services/mockDataService';
import { subscribeToMockDataState } from '../contexts/MockDataContext';

export const useTimelineV2 = (filters?: { timeline_type?: string; parent_id?: string | null }) => {
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTimelines = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let response;
      try {
        response = await fetchTimelines(filters);
      } catch (err) {
        // If API fails, use mock data if enabled
        const mockData = mockDataService.getWithFallback.timelines(null);
        if (mockData.metadata.isMock) {
          console.warn('Timelines API failed, using mock data:', err);
          response = { timelines: mockData.data };
        } else {
          throw err;
        }
      }
      
      // Use centralized mock data service
      const result = mockDataService.getWithFallback.timelines(response.timelines || []);
      
      // Apply filters
      let filteredTimelines = result.data;
      if (filters?.timeline_type) {
        filteredTimelines = filteredTimelines.filter(t => t.timeline_type === filters.timeline_type);
      }
      if (filters?.parent_id !== undefined) {
        filteredTimelines = filteredTimelines.filter(t => 
          filters.parent_id === null ? t.parent_id === null : t.parent_id === filters.parent_id
        );
      }
      
      setTimelines(filteredTimelines);
      
      // Clear error if using mock data
      if (result.metadata.isMock) {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load timelines'));
      setTimelines([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTimelines();
  }, [loadTimelines]);

  // Refresh when mock data toggle changes
  useEffect(() => {
    const unsubscribe = subscribeToMockDataState(() => {
      loadTimelines();
    });
    return unsubscribe;
  }, [loadTimelines]);

  const createTimeline = useCallback(async (payload: Parameters<typeof createTimelineApi>[0]) => {
    try {
      const response = await createTimelineApi(payload);
      await loadTimelines();
      return response.timeline;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create timeline');
    }
  }, [loadTimelines]);

  const updateTimeline = useCallback(async (id: string, payload: Parameters<typeof updateTimelineApi>[1]) => {
    try {
      const response = await updateTimelineApi(id, payload);
      await loadTimelines();
      return response.timeline;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update timeline');
    }
  }, [loadTimelines]);

  const deleteTimeline = useCallback(async (id: string) => {
    try {
      await deleteTimelineApi(id);
      await loadTimelines();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete timeline');
    }
  }, [loadTimelines]);

  return {
    timelines,
    loading,
    error,
    createTimeline,
    updateTimeline,
    deleteTimeline,
    refetch: loadTimelines
  };
};

export const useTimeline = (id: string | null) => {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setTimeline(null);
      setLoading(false);
      return;
    }

    const loadTimeline = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchTimeline(id);
        setTimeline(response.timeline);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load timeline'));
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [id]);

  return { timeline, loading, error };
};

export const useTimelineMemberships = (timelineId: string | null) => {
  const [memberships, setMemberships] = useState<TimelineMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!timelineId) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    const loadMemberships = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchTimelineMemberships(timelineId);
        setMemberships(response.memberships);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load memberships'));
      } finally {
        setLoading(false);
      }
    };

    loadMemberships();
  }, [timelineId]);

  const addMembership = useCallback(async (entryId: string, role?: string) => {
    if (!timelineId) return;
    try {
      await addMemoryToTimelineApi(timelineId, { journal_entry_id: entryId, role });
      const response = await fetchTimelineMemberships(timelineId);
      setMemberships(response.memberships);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add membership');
    }
  }, [timelineId]);

  const removeMembership = useCallback(async (entryId: string) => {
    if (!timelineId) return;
    try {
      await removeMemoryFromTimelineApi(timelineId, entryId);
      setMemberships(prev => prev.filter(m => m.journal_entry_id !== entryId));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to remove membership');
    }
  }, [timelineId]);

  return { memberships, loading, error, addMembership, removeMembership };
};

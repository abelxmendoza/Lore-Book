import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { mockContradictions, mockContradictionDetails } from '../mocks/contradictionData';
import { shouldUseMockData } from './useShouldUseMockData';
import type { ContinuityEvent, ContradictionDetails, MemoryComponent } from '../types/continuity';

export const useContradictionResolution = () => {
  const [contradictions, setContradictions] = useState<ContinuityEvent[]>([]);
  const [selectedContradiction, setSelectedContradiction] = useState<ContinuityEvent | null>(null);
  const [contradictionDetails, setContradictionDetails] = useState<ContradictionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContradictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<{ contradictions: ContinuityEvent[] }>(
        '/api/continuity/contradictions'
      );
      setContradictions(response.contradictions || []);
    } catch (err) {
      // Use mock data when API fails if toggle is enabled
      if (shouldUseMockData()) {
        console.warn('API failed, using mock data:', err);
        setContradictions(mockContradictions);
        setError(null); // Don't show error when using mock data
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch contradictions');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContradictionDetails = useCallback(async (eventId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<ContradictionDetails>(
        `/api/continuity/contradiction/${eventId}/details`
      );
      setContradictionDetails(response);
    } catch (err) {
      // Use mock data when API fails if toggle is enabled
      if (shouldUseMockData()) {
        console.warn('API failed, using mock data:', err);
        const mockDetails = mockContradictionDetails[eventId];
        if (mockDetails) {
          setContradictionDetails(mockDetails);
          setError(null); // Don't show error when using mock data
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch contradiction details');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch contradiction details');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveContradiction = useCallback(
    async (
      eventId: string,
      action: 'accept_left' | 'accept_right' | 'merge' | 'resolve_with_notes' | 'dismiss',
      notes?: string,
      resolvedText?: string
    ) => {
      try {
        await fetchJson(`/api/continuity/contradiction/${eventId}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ action, notes, resolved_text: resolvedText }),
        });
        // Refresh contradictions list
        await fetchContradictions();
        // Clear selected if resolving current
        if (selectedContradiction?.id === eventId) {
          setSelectedContradiction(null);
          setContradictionDetails(null);
        }
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to resolve contradiction');
      }
    },
    [fetchContradictions, selectedContradiction]
  );

  const getAISuggestion = useCallback(async (eventId: string) => {
    try {
      const response = await fetchJson<{
        suggestion: string;
        explanation: string;
        confidence: number;
        reasoning: string[];
        action: 'accept_left' | 'accept_right' | 'merge' | 'dismiss';
      }>(`/api/continuity/contradiction/${eventId}/suggest`, {
        method: 'POST',
      });
      return response;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to get AI suggestion');
    }
  }, []);

  useEffect(() => {
    void fetchContradictions();
  }, [fetchContradictions]);

  useEffect(() => {
    if (selectedContradiction) {
      void fetchContradictionDetails(selectedContradiction.id);
    }
  }, [selectedContradiction, fetchContradictionDetails]);

  return {
    contradictions,
    selectedContradiction,
    contradictionDetails,
    loading,
    error,
    setSelectedContradiction,
    resolveContradiction,
    getAISuggestion,
    refresh: fetchContradictions,
  };
};

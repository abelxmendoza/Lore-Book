import { useCallback, useEffect, useState } from 'react';

import { fetchContinuity, fetchMergeSuggestions, type ContinuitySnapshot } from '../api/continuity';

export const useContinuity = () => {
  const [snapshot, setSnapshot] = useState<ContinuitySnapshot | null>(null);
  const [mergeSuggestions, setMergeSuggestions] = useState<{ id: string; title: string; rationale: string }[]>([]);

  const refresh = useCallback(async () => {
    const [{ continuity }, { suggestions }] = await Promise.all([fetchContinuity(), fetchMergeSuggestions()]);
    setSnapshot(continuity);
    setMergeSuggestions(suggestions);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, mergeSuggestions, refresh };
};

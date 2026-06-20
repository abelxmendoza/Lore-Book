import { useCallback, useMemo } from 'react';
import { useAuth } from '../lib/supabase';
import { useGuest } from '../contexts/GuestContext';
import { useLocalStorage } from './useLocalStorage';
import type { GeneratedTimelineEvent } from '../components/timeline/GeneratedTimelineReveal';
import {
  GENERATED_TIMELINES_STORAGE_KEY,
  findTimelineByQuery,
  removeGeneratedTimeline,
  toggleTimelineCollapsed,
  upsertGeneratedTimeline,
  type SavedGeneratedTimeline,
} from '../lib/generatedTimelinesLibrary';

function storageKeyForUser(userId: string | undefined, isGuest: boolean): string {
  if (userId) return `${GENERATED_TIMELINES_STORAGE_KEY}:${userId}`;
  if (isGuest) return `${GENERATED_TIMELINES_STORAGE_KEY}:guest`;
  return `${GENERATED_TIMELINES_STORAGE_KEY}:anonymous`;
}

export function useGeneratedTimelinesLibrary() {
  const { user } = useAuth();
  const { isGuest } = useGuest();
  const key = storageKeyForUser(user?.id, isGuest);

  const [library, setLibrary] = useLocalStorage<SavedGeneratedTimeline[]>(key, []);

  const saveTimeline = useCallback(
    (input: {
      query: string;
      events: GeneratedTimelineEvent[];
      isMock: boolean;
      arcTitles?: string[];
      existingId?: string;
      preserveCollapsed?: boolean;
    }): SavedGeneratedTimeline | undefined => {
      let saved: SavedGeneratedTimeline | undefined;
      setLibrary((prev) => {
        const result = upsertGeneratedTimeline(prev, input);
        saved = result.saved;
        return result.library;
      });
      return saved;
    },
    [setLibrary]
  );

  const removeTimeline = useCallback(
    (id: string) => {
      setLibrary((prev) => removeGeneratedTimeline(prev, id));
    },
    [setLibrary]
  );

  const setTimelineCollapsed = useCallback(
    (id: string, collapsed: boolean) => {
      setLibrary((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, collapsed, updatedAt: new Date().toISOString() } : t
        )
      );
    },
    [setLibrary]
  );

  const toggleCollapsed = useCallback(
    (id: string) => {
      setLibrary((prev) => toggleTimelineCollapsed(prev, id));
    },
    [setLibrary]
  );

  const findByQuery = useCallback(
    (query: string) => findTimelineByQuery(library, query),
    [library]
  );

  const getById = useCallback(
    (id: string) => library.find((t) => t.id === id),
    [library]
  );

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [library]
  );

  return {
    library: sortedLibrary,
    saveTimeline,
    removeTimeline,
    setTimelineCollapsed,
    toggleCollapsed,
    findByQuery,
    getById,
  };
}

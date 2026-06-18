import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CertifiedEntity } from '../types/certifiedEntity';
import {
  buildEntityMatchIndex,
  matchCertifiedEntitiesWithIndex,
  type CertifiedEntityMatch,
  type EntityMatchIndex,
} from '../lib/certifiedEntityMatch';
import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setComposerIndexError,
  setComposerIndexReady,
  setComposerMatches,
} from '../store/slices/composerSlice';
import { selectComposerMatches } from '../store/selectors/composerSelectors';

export type EntityType = CertifiedEntity['type'];
export type EntityMatch = CertifiedEntityMatch;

const INDEX_CACHE_KEY = '/api/entities/certified-index';

type SharedIndexState = {
  entities: CertifiedEntity[];
  matchIndex: EntityMatchIndex;
  ready: boolean;
  error: string | null;
  loading: boolean;
};

let shared: SharedIndexState = {
  entities: [],
  matchIndex: buildEntityMatchIndex([]),
  ready: false,
  error: null,
  loading: false,
};

let sharedLoadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emitIndexChange(): void {
  for (const listener of listeners) listener();
}

function subscribeIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSharedSnapshot(): SharedIndexState {
  return shared;
}

async function loadSharedIndex(force = false): Promise<void> {
  if (sharedLoadPromise && !force) return sharedLoadPromise;

  shared = { ...shared, loading: true, error: null };
  emitIndexChange();

  sharedLoadPromise = (async () => {
    try {
      const data = await fetchJson<{ entities: CertifiedEntity[] }>(INDEX_CACHE_KEY);
      const entities = data.entities ?? [];
      shared = {
        entities,
        matchIndex: buildEntityMatchIndex(entities),
        ready: true,
        error: null,
        loading: false,
      };
    } catch {
      shared = {
        entities: [],
        matchIndex: buildEntityMatchIndex([]),
        ready: false,
        error: 'Entity detection is temporarily unavailable.',
        loading: false,
      };
    } finally {
      emitIndexChange();
      sharedLoadPromise = null;
    }
  })();

  return sharedLoadPromise;
}

/** Reset shared cache — for tests only. */
export function resetEntityIndexerCache(): void {
  shared = {
    entities: [],
    matchIndex: buildEntityMatchIndex([]),
    ready: false,
    error: null,
    loading: false,
  };
  sharedLoadPromise = null;
  emitIndexChange();
}

export const useEntityIndexer = () => {
  const dispatch = useAppDispatch();
  const matches = useAppSelector(selectComposerMatches);
  const sharedState = useSyncExternalStore(subscribeIndex, getSharedSnapshot, getSharedSnapshot);
  const lastTextRef = useRef('');
  const [retryTick, setRetryTick] = useState(0);

  const applyMatches = useCallback(
    (text: string, matchIndex: EntityMatchIndex) => {
      const next = text.trim() ? matchCertifiedEntitiesWithIndex(text, matchIndex) : [];
      dispatch(setComposerMatches(next));
    },
    [dispatch]
  );

  useEffect(() => {
    void loadSharedIndex(retryTick > 0);
  }, [retryTick]);

  useEffect(() => {
    dispatch(setComposerIndexReady(sharedState.ready));
    dispatch(setComposerIndexError(sharedState.error));
    if (lastTextRef.current.trim() && sharedState.ready) {
      applyMatches(lastTextRef.current, sharedState.matchIndex);
    }
  }, [sharedState.ready, sharedState.error, sharedState.matchIndex, applyMatches, dispatch]);

  useEffect(() => {
    const handler = () => {
      apiCache.delete(INDEX_CACHE_KEY);
      void loadSharedIndex(true);
    };
    window.addEventListener('lk:story-data-updated', handler);
    return () => window.removeEventListener('lk:story-data-updated', handler);
  }, []);

  const analyze = useCallback(
    (text: string) => {
      lastTextRef.current = text;
      if (!text.trim()) {
        dispatch(setComposerMatches([]));
        return;
      }
      if (!sharedState.ready) return;
      applyMatches(text, sharedState.matchIndex);
    },
    [applyMatches, dispatch, sharedState.matchIndex, sharedState.ready]
  );

  const retryLoad = useCallback(() => {
    apiCache.delete(INDEX_CACHE_KEY);
    setRetryTick((n) => n + 1);
  }, []);

  const characterMatches = useMemo(
    () => matches.filter((m) => m.type === 'character'),
    [matches]
  );
  const locationMatches = useMemo(
    () => matches.filter((m) => m.type === 'location'),
    [matches]
  );
  const orgMatches = useMemo(
    () => matches.filter((m) => m.type === 'organization'),
    [matches]
  );
  const skillMatches = useMemo(
    () => matches.filter((m) => m.type === 'skill'),
    [matches]
  );
  const eventMatches = useMemo(
    () => matches.filter((m) => m.type === 'event'),
    [matches]
  );

  return {
    index: sharedState.entities,
    loading: sharedState.loading,
    indexReady: sharedState.ready,
    indexError: sharedState.error,
    retryLoad,
    matches,
    characterMatches,
    locationMatches,
    orgMatches,
    skillMatches,
    eventMatches,
    analyze,
    linkedCharacters: characterMatches.map((m) => m.name),
    toggleLink: () => {},
  };
};

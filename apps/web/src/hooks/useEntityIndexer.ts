import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CertifiedEntity } from '../types/certifiedEntity';
import {
  buildEntityMatchIndex,
  matchCertifiedEntitiesWithIndex,
  sortCertifiedMatches,
  type CertifiedEntityMatch,
  type EntityMatchIndex,
} from '../lib/certifiedEntityMatch';
import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { LoreBookParseResponse } from '../api/loreBookParse';
import { detectDraftEntitiesInText } from '../lib/draftEntityDetect';
import { fetchLexicalPreviewShared } from '../lib/lexicalPreviewCache';
import { fetchLoreBookParseShared } from '../lib/loreBookParseCache';
import { lexicalPreviewSpansToDraftMatches } from '../lib/lexicalPreviewToDraftMatches';
import { loreBookParseToComposerMatches } from '../lib/loreBookParseToComposerMatches';
import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import { supabase } from '../lib/supabase';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { buildDemoCertifiedIndex } from '../lib/demoCertifiedIndex';
import { collapseOverlappingPersonComposerMatches } from '../lib/personComposerMatchCollapse';
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
const LEXICAL_PREVIEW_DEBOUNCE_MS = 280;

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

function isTransientAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Authentication required') ||
    message.includes('session expired') ||
    message.includes('Missing Authorization')
  );
}

function loadDemoIndex(): void {
  const entities = buildDemoCertifiedIndex();
  shared = {
    entities,
    matchIndex: buildEntityMatchIndex(entities),
    ready: true,
    error: null,
    loading: false,
  };
}

async function loadSharedIndex(force = false): Promise<void> {
  if (sharedLoadPromise && !force) return sharedLoadPromise;

  shared = { ...shared, loading: true, error: null };
  emitIndexChange();

  if (shouldUseMockData()) {
    loadDemoIndex();
    emitIndexChange();
    return;
  }

  sharedLoadPromise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        // Wait for auth — not an error state (guest / session still hydrating).
        shared = {
          entities: [],
          matchIndex: buildEntityMatchIndex([]),
          ready: false,
          error: null,
          loading: false,
        };
        return;
      }

      const data = await fetchJson<{ entities: CertifiedEntity[] }>(INDEX_CACHE_KEY);
      const entities = data.entities ?? [];
      shared = {
        entities,
        matchIndex: buildEntityMatchIndex(entities),
        ready: true,
        error: null,
        loading: false,
      };
    } catch (err) {
      if (isTransientAuthError(err)) {
        shared = {
          entities: [],
          matchIndex: buildEntityMatchIndex([]),
          ready: false,
          error: null,
          loading: false,
        };
        return;
      }
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
  const lastThreadIdRef = useRef<string | undefined>(undefined);
  const previewTimerRef = useRef<number | null>(null);
  const previewReqRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const applyMatches = useCallback(
    (
      text: string,
      matchIndex: EntityMatchIndex,
      entities: CertifiedEntity[],
      previewSpans?: LexicalPreviewSpan[],
      loreBookParse?: LoreBookParseResponse
    ) => {
      const indexMatches = text.trim() ? matchCertifiedEntitiesWithIndex(text, matchIndex) : [];
      const draftMatches = text.trim() ? detectDraftEntitiesInText(text, entities, indexMatches) : [];
      const lexicalDrafts =
        previewSpans && previewSpans.length > 0
          ? lexicalPreviewSpansToDraftMatches(previewSpans, entities, [...indexMatches, ...draftMatches])
          : [];
      const base = [...indexMatches, ...draftMatches, ...lexicalDrafts];
      const lorebookDrafts = loreBookParse
        ? loreBookParseToComposerMatches(loreBookParse, entities, base)
        : [];
      const next = collapseOverlappingPersonComposerMatches(
        text,
        [...base, ...lorebookDrafts].sort(sortCertifiedMatches)
      );
      dispatch(setComposerMatches(next));
    },
    [dispatch]
  );

  useEffect(() => {
    void loadSharedIndex(retryTick > 0);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        apiCache.delete(INDEX_CACHE_KEY);
        void loadSharedIndex(true);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [retryTick]);

  useEffect(() => {
    dispatch(setComposerIndexReady(sharedState.ready));
    dispatch(setComposerIndexError(sharedState.error));
    if (lastTextRef.current.trim() && sharedState.ready) {
      applyMatches(lastTextRef.current, sharedState.matchIndex, sharedState.entities);
    }
  }, [sharedState.ready, sharedState.error, sharedState.matchIndex, sharedState.entities, applyMatches, dispatch]);

  useEffect(() => {
    const handler = () => {
      if (shouldUseMockData()) {
        loadDemoIndex();
        emitIndexChange();
        return;
      }
      apiCache.delete(INDEX_CACHE_KEY);
      void loadSharedIndex(true);
    };
    window.addEventListener('lk:characters-updated', handler);
    window.addEventListener('lk:locations-updated', handler);
    window.addEventListener('lk:skills-updated', handler);
    window.addEventListener('lk:story-data-updated', handler);
    return () => {
      window.removeEventListener('lk:characters-updated', handler);
      window.removeEventListener('lk:locations-updated', handler);
      window.removeEventListener('lk:skills-updated', handler);
      window.removeEventListener('lk:story-data-updated', handler);
    };
  }, []);

  const analyze = useCallback(
    (text: string, threadId?: string) => {
      lastTextRef.current = text;
      lastThreadIdRef.current = threadId;
      if (!text.trim()) {
        dispatch(setComposerMatches([]));
        return;
      }
      if (!sharedState.ready) return;
      applyMatches(text, sharedState.matchIndex, sharedState.entities);

      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        const reqId = ++previewReqRef.current;
        void Promise.allSettled([
          fetchLexicalPreviewShared(text, threadId),
          fetchLoreBookParseShared(text, threadId),
        ]).then((results) => {
          if (reqId !== previewReqRef.current) return;
          if (lastTextRef.current !== text) return;
          const preview =
            results[0].status === 'fulfilled' ? results[0].value : { spans: [], inferredAssociations: [], ambiguities: [] };
          const loreBookParse = results[1].status === 'fulfilled' ? results[1].value : undefined;
          applyMatches(
            text,
            sharedState.matchIndex,
            sharedState.entities,
            preview.spans,
            loreBookParse
          );
        });
      }, LEXICAL_PREVIEW_DEBOUNCE_MS);
    },
    [applyMatches, dispatch, sharedState.matchIndex, sharedState.ready, sharedState.entities]
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

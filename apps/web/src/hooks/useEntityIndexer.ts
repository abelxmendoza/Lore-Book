import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { LoreBookParseResponse } from '../api/loreBookParse';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import {
  buildEntityMatchIndex,
  matchCertifiedEntitiesWithIndex,
  sortCertifiedMatches,
  type CertifiedEntityMatch,
  type EntityMatchIndex,
} from '../lib/certifiedEntityMatch';
import { buildDemoCertifiedIndex } from '../lib/demoCertifiedIndex';
import { detectDraftEntitiesInText } from '../lib/draftEntityDetect';
import { fetchLexicalPreviewShared, abortLexicalPreviewShared } from '../lib/lexicalPreviewCache';
import { lexicalPreviewSpansToDraftMatches } from '../lib/lexicalPreviewToDraftMatches';
import {
  composerIntelligenceMetrics,
  composerPhaseAllowsRemoteCanon,
  type ComposerIntelligencePhase,
} from '../lib/composerIntelligence';
import { fetchLoreBookParseShared, abortLoreBookParseShared } from '../lib/loreBookParseCache';
import { loreBookParseToComposerMatches } from '../lib/loreBookParseToComposerMatches';
import {
  findInstructionalExampleRanges,
  maskInstructionalExamples,
  rangeInsideInstructionalExample,
} from '../lib/maskInstructionalExamples';
import { collapseOverlappingPersonComposerMatches } from '../lib/personComposerMatchCollapse';
import { significantComposerCandidatesToMatches } from '../lib/significantComposerCandidates';
import { supabase } from '../lib/supabase';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectComposerMatches } from '../store/selectors/composerSelectors';
import {
  setComposerIndexError,
  setComposerIndexReady,
  setComposerMatches,
} from '../store/slices/composerSlice';
import type { CertifiedEntity } from '../types/certifiedEntity';

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

      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
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
          return;
        } catch (err) {
          lastErr = err;
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
          const msg = err instanceof Error ? err.message : String(err);
          const status =
            typeof err === 'object' && err && 'status' in err
              ? Number((err as { status?: number }).status)
              : undefined;
          const retryAfter =
            typeof err === 'object' && err && 'retryAfter' in err
              ? Number((err as { retryAfter?: number }).retryAfter)
              : undefined;
          const is429 = status === 429 || /429|rate limit|too many requests/i.test(msg);
          // Do not hammer the API while rate-limited — wait out Retry-After once, then surface.
          if (is429) {
            const waitMs = Math.min(
              Math.max((Number.isFinite(retryAfter) ? retryAfter! : 30) * 1000, 5_000),
              60_000,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            break;
          }
          const retryable =
            status === 503 || /timeout|network|failed to fetch/i.test(msg);
          if (!retryable || attempt === 2) break;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1) ** 2));
        }
      }

      if (isTransientAuthError(lastErr)) {
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
  const previewAbortRef = useRef<AbortController | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const applyMatches = useCallback(
    (
      text: string,
      matchIndex: EntityMatchIndex,
      entities: CertifiedEntity[],
      previewSpans?: LexicalPreviewSpan[],
      loreBookParse?: LoreBookParseResponse
    ) => {
      // Prefill hints like (e.g. "actually her name is Maya") must not spawn chips.
      const matchText = maskInstructionalExamples(text);
      const exampleRanges = findInstructionalExampleRanges(text);
      const usablePreviewSpans = (previewSpans ?? []).filter(
        (span) => !rangeInsideInstructionalExample(span.start, span.end, exampleRanges),
      );
      composerIntelligenceMetrics.noteEntityScan();
      const indexMatches = matchText.trim()
        ? matchCertifiedEntitiesWithIndex(matchText, matchIndex)
        : [];
      const draftMatches = matchText.trim()
        ? detectDraftEntitiesInText(matchText, entities, indexMatches)
        : [];
      const lexicalDrafts =
        usablePreviewSpans.length > 0
          ? lexicalPreviewSpansToDraftMatches(usablePreviewSpans, entities, [
              ...indexMatches,
              ...draftMatches,
            ])
          : [];
      const base = [...indexMatches, ...draftMatches, ...lexicalDrafts];
      const lorebookDrafts = loreBookParse
        ? loreBookParseToComposerMatches(loreBookParse, entities, base)
        : [];
      const promotedCandidates = significantComposerCandidatesToMatches(
        matchText,
        entities,
        [...base, ...lorebookDrafts]
      );
      const next = collapseOverlappingPersonComposerMatches(
        matchText,
        [...base, ...lorebookDrafts, ...promotedCandidates].sort(sortCertifiedMatches)
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

  // Auto-retry entity index after transient failures — slow enough not to amplify 429 storms.
  useEffect(() => {
    if (!sharedState.error || sharedState.loading || sharedState.ready) return;
    const timer = window.setTimeout(() => {
      apiCache.delete(INDEX_CACHE_KEY);
      void loadSharedIndex(true);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [sharedState.error, sharedState.loading, sharedState.ready]);

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

  const abortInFlightPreview = useCallback(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    abortLexicalPreviewShared();
    abortLoreBookParseShared();
  }, []);

  /** Record the live draft immediately so an index that finishes loading
   *  after the last keystroke can still match, without running the expensive
   *  scan on the keystroke itself. */
  const primeDraft = useCallback((text: string, threadId?: string) => {
    lastTextRef.current = text;
    lastThreadIdRef.current = threadId;
  }, []);

  const runAuthoritativePreview = useCallback(
    (text: string, threadId?: string, debounceMs = 0) => {
      const start = () => {
        const reqId = ++previewReqRef.current;
        const controller = new AbortController();
        previewAbortRef.current = controller;
        void Promise.allSettled([
          fetchLexicalPreviewShared(text, threadId, controller.signal),
          fetchLoreBookParseShared(text, threadId, controller.signal),
        ]).then((results) => {
          if (controller.signal.aborted) return;
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
      };
      if (debounceMs <= 0) {
        start();
        return;
      }
      previewTimerRef.current = window.setTimeout(start, debounceMs);
    },
    [applyMatches, sharedState.matchIndex, sharedState.entities],
  );

  const analyze = useCallback(
    (text: string, threadId?: string, phase?: ComposerIntelligencePhase) => {
      lastTextRef.current = text;
      lastThreadIdRef.current = threadId;
      abortInFlightPreview();
      if (!text.trim()) {
        dispatch(setComposerMatches([]));
        return;
      }
      if (phase === 'keystroke') return;
      if (!sharedState.ready) return;
      applyMatches(text, sharedState.matchIndex, sharedState.entities);

      // Omitted phase keeps the landed idle+remote path for existing callers.
      // Explicit lightweight (composer idle) stays local. Authoritative (blur/send)
      // fetches immediately — the caller already delayed.
      if (phase === 'lightweight' || (phase && !composerPhaseAllowsRemoteCanon(phase))) {
        return;
      }
      runAuthoritativePreview(
        text,
        threadId,
        phase === 'authoritative' ? 0 : LEXICAL_PREVIEW_DEBOUNCE_MS,
      );
    },
    [abortInFlightPreview, applyMatches, dispatch, runAuthoritativePreview, sharedState.matchIndex, sharedState.ready, sharedState.entities]
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
    abortInFlightPreview,
    primeDraft,
    matches,
    characterMatches,
    locationMatches,
    orgMatches,
    skillMatches,
    eventMatches,
    analyze,
    requestAuthoritativePreview: (text: string, threadId?: string) =>
      analyze(text, threadId, 'authoritative'),
    linkedCharacters: characterMatches.map((m) => m.name),
    toggleLink: () => {},
  };
};

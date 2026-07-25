import { useCallback, useMemo } from 'react';

import { useGuest } from '../../contexts/GuestContext';
import { useMockData } from '../../contexts/MockDataContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../lib/supabase';
import {
  useGetBookEntityIndexQuery,
  useGetCharactersBookQuery,
  useGetLocationsBookQuery,
  useGetProjectsBookQuery,
  useGetSkillsBookQuery,
  useGetOrganizationsQuery,
  useGetGroupCandidatesQuery,
  useGetEventsQuery,
  useAssembleEventsFromChatsMutation,
  entitiesApi,
  type BookEntitySummary,
  type BookEntityType,
} from '../api/entitiesApi';
import { useAppDispatch } from '../hooks';

/** Shared skip gate for entity-book RTK queries (mock/guest/unauthenticated). */
export function useEntityBookRuntime() {
  const { user, loading: authLoading } = useAuth();
  const { useMockData: isMockEnabled } = useMockData();
  const { isGuest, guestState } = useGuest();

  const skipServer =
    authLoading || isMockEnabled || isGuest || !user;

  return {
    authLoading,
    isMockEnabled,
    isGuest,
    guestId: guestState?.guestId,
    user,
    skipServer,
  };
}

/**
 * Shared server-backed search for any Book surface. The debounce and runtime
 * gate keep guest/demo surfaces local while authenticated Books share one
 * bounded query/cache contract.
 */
export function useBookEntityIndexSearch(
  types: BookEntityType[],
  search: string,
  options: {
    limit?: number;
    minLength?: number;
    enabled?: boolean;
    mockEntities?: BookEntitySummary[];
  } = {},
) {
  const runtime = useEntityBookRuntime();
  const normalizedSearch = search.trim();
  const debouncedSearch = useDebounce(normalizedSearch, 250);
  const minLength = options.minLength ?? 2;
  const limit = Math.max(1, Math.min(options.limit ?? 100, 100));
  const enabled = options.enabled ?? true;
  const isCurrentSearch = normalizedSearch === debouncedSearch;
  const hasSearch = normalizedSearch.length >= minLength && debouncedSearch.length >= minLength;
  const useLocalDemoIndex = runtime.isMockEnabled && options.mockEntities !== undefined;
  const shouldSkipServer =
    runtime.skipServer ||
    !enabled ||
    !hasSearch;
  const query = useGetBookEntityIndexQuery(
    {
      types,
      q: debouncedSearch,
      limit,
      offset: 0,
    },
    { skip: shouldSkipServer },
  );
  const localResult = useMemo(() => {
    if (!useLocalDemoIndex || !enabled || !hasSearch || !isCurrentSearch) {
      return { entities: [] as BookEntitySummary[], counts: {}, total: 0 };
    }
    const typeSet = new Set(types);
    const term = debouncedSearch.toLocaleLowerCase();
    const matches = (options.mockEntities ?? [])
      .filter((entity) => typeSet.has(entity.type))
      .filter((entity) =>
        [entity.name, ...entity.aliases]
          .some((label) => label.toLocaleLowerCase().includes(term))
      )
      .sort((left, right) => {
        const updated = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
        return updated || left.name.localeCompare(right.name);
      });
    const counts: Partial<Record<BookEntityType, number>> = {};
    for (const entity of matches) {
      counts[entity.type] = (counts[entity.type] ?? 0) + 1;
    }
    return {
      entities: matches.slice(0, limit),
      counts,
      total: matches.length,
    };
  }, [
    debouncedSearch,
    enabled,
    hasSearch,
    isCurrentSearch,
    limit,
    options.mockEntities,
    types,
    useLocalDemoIndex,
  ]);
  const activeResult = useLocalDemoIndex ? localResult : {
    entities: isCurrentSearch ? query.data?.entities ?? [] : [],
    total: isCurrentSearch ? query.data?.total ?? 0 : 0,
    counts: isCurrentSearch ? query.data?.counts ?? {} : {},
  };

  return {
    ...activeResult,
    isSearching:
      enabled &&
      normalizedSearch.length >= minLength &&
      (!isCurrentSearch || (!useLocalDemoIndex && (query.isLoading || query.isFetching))),
    isActive:
      enabled &&
      hasSearch &&
      (useLocalDemoIndex || !shouldSkipServer),
    error: useLocalDemoIndex ? undefined : query.error,
    source: useLocalDemoIndex ? 'demo' as const : 'server' as const,
  };
}

function useEntityBookQuery<TData>(
  query: {
    data?: TData;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => unknown;
  },
  skipServer: boolean,
  authLoading: boolean
) {
  const dispatch = useAppDispatch();

  const refetch = useCallback(async () => {
    if (skipServer) return;
    await query.refetch();
  }, [query, skipServer]);

  const loading = authLoading || (!skipServer && (query.isLoading || query.isFetching));

  return { data: query.data, loading, refetch, dispatch };
}

export function useCharactersBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetCharactersBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);
  const { dispatch } = base;

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Character']));
  }, [dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useLocationsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetLocationsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);
  const { dispatch } = base;

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Location']));
  }, [dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useProjectsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetProjectsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);
  const { dispatch } = base;

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Project']));
  }, [dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useSkillsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetSkillsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);
  const { dispatch } = base;

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Skill']));
  }, [dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useOrganizationsBookData() {
  const runtime = useEntityBookRuntime();
  const orgsQuery = useGetOrganizationsQuery(undefined, { skip: runtime.skipServer });
  const candidatesQuery = useGetGroupCandidatesQuery(undefined, { skip: runtime.skipServer });
  const dispatch = useAppDispatch();

  const loading =
    runtime.authLoading ||
    (!runtime.skipServer &&
      (orgsQuery.isLoading ||
        orgsQuery.isFetching ||
        candidatesQuery.isLoading ||
        candidatesQuery.isFetching));

  const refetch = useCallback(async () => {
    if (runtime.skipServer) return;
    await Promise.all([orgsQuery.refetch(), candidatesQuery.refetch()]);
  }, [runtime.skipServer, orgsQuery, candidatesQuery]);

  const organizations = useMemo(
    () => (orgsQuery.data?.organizations ?? []) as Array<Record<string, unknown>>,
    [orgsQuery.data]
  );

  const candidates = useMemo(
    () => (candidatesQuery.data?.candidates ?? []) as Array<Record<string, unknown>>,
    [candidatesQuery.data]
  );

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Organization']));
  }, [dispatch]);

  return { ...runtime, organizations, candidates, loading, refetch, invalidate, dispatch };
}

export function useEventsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetEventsQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);
  const { dispatch } = base;
  const [assembleEventsFromChats, assembleState] = useAssembleEventsFromChatsMutation();

  const events = useMemo(
    () => (query.data?.events ?? []) as Array<Record<string, unknown>>,
    [query.data]
  );

  const eventsSuccess = query.data?.success ?? true;

  const invalidate = useCallback(() => {
    dispatch(entitiesApi.util.invalidateTags(['Event']));
  }, [dispatch]);

  const assembleFromChats = useCallback(
    async (windowDays = 3650) => {
      await assembleEventsFromChats({ windowDays }).unwrap();
    },
    [assembleEventsFromChats]
  );

  return {
    ...runtime,
    ...base,
    events,
    eventsSuccess,
    assembleFromChats,
    isAssembling: assembleState.isLoading,
    invalidate,
  };
}

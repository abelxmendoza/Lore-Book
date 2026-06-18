import { useCallback, useMemo } from 'react';

import { useAuth } from '../../lib/supabase';
import { useMockData } from '../../contexts/MockDataContext';
import { useGuest } from '../../contexts/GuestContext';
import {
  useGetCharactersBookQuery,
  useGetLocationsBookQuery,
  useGetProjectsBookQuery,
  useGetSkillsBookQuery,
  useGetOrganizationsQuery,
  useGetGroupCandidatesQuery,
  useGetEventsQuery,
  useAssembleEventsFromChatsMutation,
  entitiesApi,
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

  const invalidate = useCallback(() => {
    base.dispatch(entitiesApi.util.invalidateTags(['Character']));
  }, [base.dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useLocationsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetLocationsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);

  const invalidate = useCallback(() => {
    base.dispatch(entitiesApi.util.invalidateTags(['Location']));
  }, [base.dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useProjectsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetProjectsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);

  const invalidate = useCallback(() => {
    base.dispatch(entitiesApi.util.invalidateTags(['Project']));
  }, [base.dispatch]);

  return { ...runtime, ...base, invalidate };
}

export function useSkillsBookData() {
  const runtime = useEntityBookRuntime();
  const query = useGetSkillsBookQuery(undefined, { skip: runtime.skipServer });
  const base = useEntityBookQuery(query, runtime.skipServer, runtime.authLoading);

  const invalidate = useCallback(() => {
    base.dispatch(entitiesApi.util.invalidateTags(['Skill']));
  }, [base.dispatch]);

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
  const [assembleEventsFromChats, assembleState] = useAssembleEventsFromChatsMutation();

  const events = useMemo(
    () => (query.data?.events ?? []) as Array<Record<string, unknown>>,
    [query.data]
  );

  const eventsSuccess = query.data?.success ?? true;

  const invalidate = useCallback(() => {
    base.dispatch(entitiesApi.util.invalidateTags(['Event']));
  }, [base.dispatch]);

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

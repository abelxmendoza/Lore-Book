import type {
  CharactersBookPayload,
  LocationsBookPayload,
  ProjectsBookPayload,
  SkillsBookPayload,
} from '../../api/books';

import { baseApi } from './baseApi';

/** Server response envelopes vary; the books BFF returns `{ success, data }` or the payload directly. */
type Envelope<T> = T & { success?: boolean; data?: T };

function unwrap<T>(res: Envelope<T>): T {
  return (res.data ?? res) as T;
}

/**
 * Server-state for entity book domains (characters, locations, organizations,
 * projects, skills, events).
 *
 * Quest server-state lives in `questsApi.ts`.
 */
export const entitiesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCharactersBook: build.query<CharactersBookPayload, void>({
      query: () => ({ url: '/api/books/characters' }),
      transformResponse: (res: Envelope<CharactersBookPayload>) => unwrap(res),
      providesTags: ['Character'],
    }),
    getLocationsBook: build.query<LocationsBookPayload, void>({
      query: () => ({ url: '/api/books/locations' }),
      transformResponse: (res: Envelope<LocationsBookPayload>) => unwrap(res),
      providesTags: ['Location'],
    }),
    getProjectsBook: build.query<ProjectsBookPayload, void>({
      query: () => ({ url: '/api/books/projects' }),
      transformResponse: (res: Envelope<ProjectsBookPayload>) => unwrap(res),
      providesTags: ['Project'],
    }),
    getSkillsBook: build.query<SkillsBookPayload, void>({
      query: () => ({ url: '/api/books/skills' }),
      transformResponse: (res: Envelope<SkillsBookPayload>) => unwrap(res),
      providesTags: ['Skill'],
    }),
    getOrganizations: build.query<{ success: boolean; organizations: Array<Record<string, unknown>> }, void>({
      query: () => ({ url: '/api/organizations' }),
      providesTags: ['Organization'],
    }),
    getGroupCandidates: build.query<
      { success: boolean; candidates: Array<Record<string, unknown>> },
      void
    >({
      query: () => ({ url: '/api/group-candidates?status=pending' }),
      providesTags: ['Organization'],
    }),
    getEvents: build.query<{ success: boolean; events: Array<Record<string, unknown>> }, void>({
      query: () => ({ url: '/api/conversation/events' }),
      transformResponse: (res: { success?: boolean; events?: Array<Record<string, unknown>> }) => ({
        success: res.success ?? true,
        events: res.events ?? [],
      }),
      providesTags: ['Event'],
    }),

    assembleEventsFromChats: build.mutation<
      { success: boolean; windowDays: number; events: unknown[] },
      { windowDays?: number } | void
    >({
      query: (arg) => ({
        url: '/api/conversation/assemble-events',
        method: 'POST',
        body: { windowDays: arg?.windowDays ?? 3650 },
      }),
      invalidatesTags: ['Event'],
    }),

    deleteOrganization: build.mutation<unknown, string>({
      query: (id) => ({ url: `/api/organizations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Organization'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetCharactersBookQuery,
  useGetLocationsBookQuery,
  useGetProjectsBookQuery,
  useGetSkillsBookQuery,
  useGetOrganizationsQuery,
  useGetGroupCandidatesQuery,
  useGetEventsQuery,
  useAssembleEventsFromChatsMutation,
  useDeleteOrganizationMutation,
} = entitiesApi;

import type {
  CharactersBookPayload,
  LocationsBookPayload,
  ProjectsBookPayload,
  SkillsBookPayload,
} from '../../api/books';

import { invalidateCache } from '../../lib/requestCache';
import { baseApi } from './baseApi';

/** Server response envelopes vary; the books BFF returns `{ success, data }` or the payload directly. */
type Envelope<T> = T & { success?: boolean; data?: T };

function unwrap<T>(res: Envelope<T>): T {
  return (res.data ?? res) as T;
}

type CharacterUpdateInput = {
  id: string;
  values: Record<string, unknown>;
};

type CharacterDeleteInput = {
  id: string;
  redistribute?: boolean;
  reason?: string;
  reason_note?: string;
};

type CharacterMergeInput = {
  source_id: string;
  target_id: string;
  reason?: string;
};

type LinkRomanticRelationshipInput = {
  id: string;
  character_id?: string;
  character_name?: string;
};

type RomanticRelationshipUpdateInput = {
  id: string;
  values: Record<string, unknown>;
};

type RomanticRelationshipDeleteInput = {
  id: string;
  reason?: string;
  reason_note?: string;
};

type RomanticRelationshipsResponse = {
  success: boolean;
  relationships: Array<Record<string, unknown>>;
};

type OrganizationUpdateInput = {
  id: string;
  values: Record<string, unknown>;
};

type OrganizationMemberCreateInput = {
  organizationId: string;
  member: Record<string, unknown>;
};

type OrganizationNestedDeleteInput = {
  organizationId: string;
  itemId: string;
};

type OrganizationEventCreateInput = {
  organizationId: string;
  event: Record<string, unknown>;
};

type OrganizationStoryCreateInput = {
  organizationId: string;
  story: Record<string, unknown>;
};

type OrganizationLocationCreateInput = {
  organizationId: string;
  location: Record<string, unknown>;
};

type OrganizationRelationshipCreateInput = {
  organizationId: string;
  relationship: Record<string, unknown>;
};

type OrganizationRelationshipDeleteInput = {
  organizationId: string;
  relationshipId: string;
};

async function invalidateOrganizationCaches(id: string, queryFulfilled: Promise<unknown>) {
  try {
    await queryFulfilled;
  } catch {
    // Mutation failure is surfaced by the caller's unwrap(); never leak an
    // unhandled rejection from cache housekeeping.
    return;
  }
  invalidateCache(id);
  invalidateCache('/api/organizations');
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
      // Keep cached org list warm across surface switches; invalidation still
      // refetches after mutations. Cuts repeat full-book downloads when legacy
      // lk:* events fire while the user navigates away and back.
      keepUnusedDataFor: 300,
    }),
    getGroupCandidates: build.query<
      { success: boolean; candidates: Array<Record<string, unknown>> },
      void
    >({
      query: () => ({ url: '/api/group-candidates?status=pending' }),
      providesTags: ['Organization'],
      keepUnusedDataFor: 300,
    }),
    getEvents: build.query<{ success: boolean; events: Array<Record<string, unknown>> }, void>({
      query: () => ({ url: '/api/conversation/events' }),
      transformResponse: (res: { success?: boolean; events?: Array<Record<string, unknown>> }) => ({
        success: res.success ?? true,
        events: res.events ?? [],
      }),
      providesTags: ['Event'],
    }),

    getRomanticRelationships: build.query<RomanticRelationshipsResponse, void>({
      query: () => ({ url: '/api/conversation/romantic-relationships' }),
      transformResponse: (res: { success?: boolean; relationships?: Array<Record<string, unknown>> }) => ({
        success: res.success ?? true,
        relationships: res.relationships ?? [],
      }),
      providesTags: ['RomanticRelationship'],
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

    rescanRomanticRelationships: build.mutation<unknown, void>({
      query: () => ({
        url: '/api/conversation/romantic-relationships/rescan',
        method: 'POST',
      }),
      invalidatesTags: ['RomanticRelationship', 'Character'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/conversation/romantic-relationships');
      },
    }),

    calculateRomanticAffection: build.mutation<unknown, void>({
      query: () => ({
        url: '/api/conversation/romantic-relationships/calculate-affection',
        method: 'POST',
      }),
      invalidatesTags: ['RomanticRelationship'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/conversation/romantic-relationships');
      },
    }),

    calculateRomanticRankings: build.mutation<unknown, void>({
      query: () => ({
        url: '/api/conversation/romantic-relationships/calculate-rankings',
        method: 'POST',
      }),
      invalidatesTags: ['RomanticRelationship'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/conversation/romantic-relationships');
      },
    }),

    updateCharacter: build.mutation<unknown, CharacterUpdateInput>({
      query: ({ id, values }) => ({
        url: `/api/characters/${id}`,
        method: 'PATCH',
        body: values,
      }),
      invalidatesTags: ['Character'],
      async onQueryStarted({ id }, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache(id);
        invalidateCache('/api/characters');
      },
    }),

    deleteCharacter: build.mutation<unknown, CharacterDeleteInput>({
      query: ({ id, redistribute, reason, reason_note }) => ({
        url: `/api/characters/${id}${redistribute ? '?redistribute=true' : ''}`,
        method: 'DELETE',
        body: {
          ...(reason ? { reason } : {}),
          ...(reason_note ? { reason_note } : {}),
        },
      }),
      invalidatesTags: ['Character'],
      async onQueryStarted({ id }, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache(id);
        invalidateCache('/api/characters');
      },
    }),

    mergeCharacters: build.mutation<unknown, CharacterMergeInput>({
      query: (body) => ({
        url: '/api/characters/merge',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Character', 'Organization', 'Event'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache();
      },
    }),

    linkRomanticRelationshipToCharacter: build.mutation<
      { success: boolean; character_id: string },
      LinkRomanticRelationshipInput
    >({
      query: ({ id, character_id, character_name }) => ({
        url: `/api/conversation/romantic-relationships/${id}/link-character`,
        method: 'POST',
        body: {
          ...(character_id ? { character_id } : {}),
          ...(character_name ? { character_name } : {}),
        },
      }),
      invalidatesTags: ['Character', 'RomanticRelationship'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/characters');
        invalidateCache('/api/conversation/romantic-relationships');
      },
    }),

    updateRomanticRelationship: build.mutation<unknown, RomanticRelationshipUpdateInput>({
      query: ({ id, values }) => ({
        url: `/api/conversation/romantic-relationships/${id}`,
        method: 'PATCH',
        body: values,
      }),
      invalidatesTags: ['RomanticRelationship', 'Character'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/conversation/romantic-relationships');
        invalidateCache('/api/characters');
      },
    }),

    deleteRomanticRelationship: build.mutation<unknown, RomanticRelationshipDeleteInput>({
      query: ({ id, reason, reason_note }) => ({
        url: `/api/conversation/romantic-relationships/${id}`,
        method: 'DELETE',
        body: {
          ...(reason ? { reason } : {}),
          ...(reason_note ? { reason_note } : {}),
        },
      }),
      invalidatesTags: ['RomanticRelationship', 'Character'],
      async onQueryStarted(_, { queryFulfilled }) {
        await queryFulfilled;
        invalidateCache('/api/conversation/romantic-relationships');
        invalidateCache('/api/characters');
      },
    }),

    updateOrganization: build.mutation<unknown, OrganizationUpdateInput>({
      query: ({ id, values }) => ({
        url: `/api/organizations/${id}`,
        method: 'PATCH',
        body: values,
      }),
      invalidatesTags: ['Organization'],
      async onQueryStarted({ id }, { queryFulfilled }) {
        await invalidateOrganizationCaches(id, queryFulfilled);
      },
    }),

    deleteOrganization: build.mutation<unknown, string>({
      query: (id) => ({ url: `/api/organizations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Organization'],
      async onQueryStarted(id, { queryFulfilled }) {
        await invalidateOrganizationCaches(id, queryFulfilled);
      },
    }),

    addOrganizationMember: build.mutation<unknown, OrganizationMemberCreateInput>({
      query: ({ organizationId, member }) => ({
        url: `/api/organizations/${organizationId}/members`,
        method: 'POST',
        body: member,
      }),
      invalidatesTags: ['Organization', 'Character'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    removeOrganizationMember: build.mutation<unknown, OrganizationNestedDeleteInput>({
      query: ({ organizationId, itemId }) => ({
        url: `/api/organizations/${organizationId}/members/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Organization', 'Character'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    addOrganizationEvent: build.mutation<unknown, OrganizationEventCreateInput>({
      query: ({ organizationId, event }) => ({
        url: `/api/organizations/${organizationId}/events`,
        method: 'POST',
        body: event,
      }),
      invalidatesTags: ['Organization', 'Event'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    removeOrganizationEvent: build.mutation<unknown, OrganizationNestedDeleteInput>({
      query: ({ organizationId, itemId }) => ({
        url: `/api/organizations/${organizationId}/events/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Organization', 'Event'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    addOrganizationStory: build.mutation<unknown, OrganizationStoryCreateInput>({
      query: ({ organizationId, story }) => ({
        url: `/api/organizations/${organizationId}/stories`,
        method: 'POST',
        body: story,
      }),
      invalidatesTags: ['Organization'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    removeOrganizationStory: build.mutation<unknown, OrganizationNestedDeleteInput>({
      query: ({ organizationId, itemId }) => ({
        url: `/api/organizations/${organizationId}/stories/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Organization'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    addOrganizationLocation: build.mutation<unknown, OrganizationLocationCreateInput>({
      query: ({ organizationId, location }) => ({
        url: `/api/organizations/${organizationId}/locations`,
        method: 'POST',
        body: location,
      }),
      invalidatesTags: ['Organization', 'Location'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    removeOrganizationLocation: build.mutation<unknown, OrganizationNestedDeleteInput>({
      query: ({ organizationId, itemId }) => ({
        url: `/api/organizations/${organizationId}/locations/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Organization', 'Location'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    addOrganizationRelationship: build.mutation<unknown, OrganizationRelationshipCreateInput>({
      query: ({ organizationId, relationship }) => ({
        url: `/api/organizations/${organizationId}/relationships`,
        method: 'POST',
        body: relationship,
      }),
      invalidatesTags: ['Organization'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    removeOrganizationRelationship: build.mutation<unknown, OrganizationRelationshipDeleteInput>({
      query: ({ organizationId, relationshipId }) => ({
        url: `/api/organizations/${organizationId}/relationships/${relationshipId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Organization'],
      async onQueryStarted({ organizationId }, { queryFulfilled }) {
        await invalidateOrganizationCaches(organizationId, queryFulfilled);
      },
    }),

    reclassifyEntity: build.mutation<unknown, { id: string; targetDomain: string }>({
      query: ({ id, targetDomain }) => ({
        url: `/api/characters/${id}/reclassify`,
        method: 'POST',
        body: { targetDomain },
      }),
      invalidatesTags: ['Character', 'Organization', 'Location', 'Project', 'Skill'],
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
  useGetRomanticRelationshipsQuery,
  useAssembleEventsFromChatsMutation,
  useRescanRomanticRelationshipsMutation,
  useCalculateRomanticAffectionMutation,
  useCalculateRomanticRankingsMutation,
  useUpdateCharacterMutation,
  useDeleteCharacterMutation,
  useMergeCharactersMutation,
  useLinkRomanticRelationshipToCharacterMutation,
  useUpdateRomanticRelationshipMutation,
  useDeleteRomanticRelationshipMutation,
  useUpdateOrganizationMutation,
  useDeleteOrganizationMutation,
  useAddOrganizationMemberMutation,
  useRemoveOrganizationMemberMutation,
  useAddOrganizationEventMutation,
  useRemoveOrganizationEventMutation,
  useAddOrganizationStoryMutation,
  useRemoveOrganizationStoryMutation,
  useAddOrganizationLocationMutation,
  useRemoveOrganizationLocationMutation,
  useAddOrganizationRelationshipMutation,
  useRemoveOrganizationRelationshipMutation,
  useReclassifyEntityMutation,
} = entitiesApi;

import type {
  JournalEntry,
  Chapter,
  ChapterProfile,
  ChapterCandidate,
  TimelineResponse,
} from '../../contexts/LoreKeeperContext';

import { baseApi } from './baseApi';

interface TimelineTag {
  name: string;
  count: number;
}

/**
 * Server-state for the core lore surfaces: journal entries, the timeline, and
 * chapters. This is the structured replacement for the manual fetch + in-memory
 * cache currently living in `LoreKeeperContext`/`lib/cache.ts`.
 */
export const loreApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getEntries: build.query<JournalEntry[], void>({
      query: () => ({ url: '/api/entries' }),
      transformResponse: (res: { entries: JournalEntry[] }) => res.entries ?? [],
      providesTags: ['Entry'],
    }),
    getTimeline: build.query<TimelineResponse, void>({
      query: () => ({ url: '/api/timeline' }),
      transformResponse: (res: { timeline: TimelineResponse }) =>
        res.timeline ?? { chapters: [], unassigned: [] },
      providesTags: ['Timeline'],
    }),
    getChapters: build.query<
      { chapters: ChapterProfile[]; candidates: ChapterCandidate[] },
      void
    >({
      query: () => ({ url: '/api/chapters' }),
      transformResponse: (res: {
        chapters?: ChapterProfile[];
        candidates?: ChapterCandidate[];
      }) => ({
        chapters: res.chapters ?? [],
        candidates: res.candidates ?? [],
      }),
      providesTags: ['Chapter'],
    }),
    getTimelineTags: build.query<TimelineTag[], void>({
      query: () => ({ url: '/api/timeline/tags' }),
      transformResponse: (res: { tags: TimelineTag[] }) => res.tags ?? [],
      providesTags: ['Timeline'],
    }),

    addEntry: build.mutation<JournalEntry, { content: string; tags?: string[]; date?: string }>({
      query: (body) => ({ url: '/api/entries', method: 'POST', body }),
      transformResponse: (res: { entry: JournalEntry }) => res.entry,
      invalidatesTags: ['Entry', 'Timeline'],
    }),
    createChapter: build.mutation<Chapter, { title: string; start_date: string; end_date?: string }>({
      query: (body) => ({ url: '/api/chapters', method: 'POST', body }),
      transformResponse: (res: { chapter: Chapter }) => res.chapter,
      invalidatesTags: ['Chapter', 'Timeline'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetEntriesQuery,
  useGetTimelineQuery,
  useGetTimelineTagsQuery,
  useGetChaptersQuery,
  useAddEntryMutation,
  useCreateChapterMutation,
} = loreApi;

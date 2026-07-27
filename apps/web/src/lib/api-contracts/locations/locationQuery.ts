import { z } from 'zod';

export const LOCATION_QUERY_VISIT_STATES = ['visited', 'mentioned_only', 'unvisited'] as const;
export const LOCATION_QUERY_TRENDS = ['increasing', 'stable', 'decreasing'] as const;
export const LOCATION_QUERY_SORTS = [
  'relevance',
  'name_asc',
  'recent',
  'visits_desc',
  'mentions_desc',
  'importance_desc',
] as const;

export const locationQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(''),
  filters: z
    .object({
      locationIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      types: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      kinds: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      cities: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      regions: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      countries: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      personNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      organizationNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      parentLocationIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      visitStates: z.array(z.enum(LOCATION_QUERY_VISIT_STATES)).max(3).optional(),
      trends: z.array(z.enum(LOCATION_QUERY_TRENDS)).max(3).optional(),
      hasCoordinates: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      minVisits: z.number().int().min(0).max(100_000).optional(),
      minMentions: z.number().int().min(0).max(100_000).optional(),
    })
    .optional()
    .default({}),
  sort: z.enum(LOCATION_QUERY_SORTS).optional().default('relevance'),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type LocationQueryRequest = z.infer<typeof locationQueryRequestSchema>;
export type LocationQueryVisitState = (typeof LOCATION_QUERY_VISIT_STATES)[number];

export type LocationQueryResult = {
  locationId: string;
  name: string;
  aliases: string[];
  type?: string | null;
  kind: string;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  parentLocationId?: string | null;
  visitState: LocationQueryVisitState;
  visitCount: number;
  mentionCount: number;
  attendanceCount: number;
  lastVisited?: string | null;
  lastMentioned?: string | null;
  hasCoordinates: boolean;
  peopleNames: string[];
  organizationNames: string[];
  trend?: string | null;
  importanceScore?: number | null;
  needsReview: boolean;
  score: number;
  matchedReasons: string[];
};

export type LocationQueryResponse = {
  query: string;
  intent:
    | 'browse'
    | 'find'
    | 'person'
    | 'organization'
    | 'geography'
    | 'activity'
    | 'hierarchy'
    | 'quality';
  results: LocationQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    types: Array<{ value: string; count: number }>;
    kinds: Array<{ value: string; count: number }>;
    cities: Array<{ value: string; count: number }>;
    visitStates: Array<{ value: string; count: number }>;
    trends: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

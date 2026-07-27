import { z } from 'zod';

export const ORGANIZATION_QUERY_STANCES = [
  'mine',
  'close_to',
  'their_world',
  'mentioned',
] as const;

export type OrganizationQueryStance = (typeof ORGANIZATION_QUERY_STANCES)[number];

export const ORGANIZATION_QUERY_SORTS = [
  'relevance',
  'name_asc',
  'name_desc',
  'recent',
  'member_count_desc',
  'activity_desc',
] as const;

export type OrganizationQuerySort = (typeof ORGANIZATION_QUERY_SORTS)[number];

export const organizationQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(''),
  filters: z.object({
    organizationIds: z.array(z.string().uuid()).max(100).optional(),
    stances: z.array(z.enum(ORGANIZATION_QUERY_STANCES)).max(4).optional(),
    groupTypes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    statuses: z.array(z.enum(['active', 'inactive', 'dissolved'])).max(3).optional(),
    memberNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    locationNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    hasUnlinkedMembers: z.boolean().optional(),
  }).optional().default({}),
  sort: z.enum(ORGANIZATION_QUERY_SORTS).optional().default('relevance'),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type OrganizationQueryRequest = z.infer<typeof organizationQueryRequestSchema>;

export type OrganizationQueryEvidence = {
  kind: 'name' | 'alias' | 'description' | 'member' | 'location' | 'activity' | 'relationship';
  label: string;
  sourceId?: string;
};

export type OrganizationQueryResult = {
  organizationId: string;
  name: string;
  aliases: string[];
  description?: string | null;
  groupType: string;
  status: 'active' | 'inactive' | 'dissolved';
  userRelationship?: string | null;
  stance: OrganizationQueryStance;
  memberCount: number;
  linkedMemberCount: number;
  unlinkedMemberCount: number;
  activityCount: number;
  locationCount: number;
  updatedAt?: string | null;
  score: number;
  matchedReasons: string[];
  evidence: OrganizationQueryEvidence[];
};

export type OrganizationQueryFacet = {
  value: string;
  count: number;
};

export type OrganizationQueryResponse = {
  query: string;
  intent: 'browse' | 'find' | 'membership' | 'location' | 'activity' | 'quality';
  results: OrganizationQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    stances: OrganizationQueryFacet[];
    groupTypes: OrganizationQueryFacet[];
    statuses: OrganizationQueryFacet[];
  };
  appliedFilters: {
    stances: OrganizationQueryStance[];
    groupTypes: string[];
    statuses: string[];
    memberNames: string[];
    locationNames: string[];
    hasUnlinkedMembers?: boolean;
  };
  warnings: string[];
};


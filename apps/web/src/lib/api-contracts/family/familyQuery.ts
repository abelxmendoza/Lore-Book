import { z } from 'zod';

export const FAMILY_QUERY_SIDES = ['maternal', 'paternal', 'partner', 'both', 'other'] as const;
export const FAMILY_QUERY_INFERENCE = ['asserted', 'inferred', 'placeholder'] as const;
export const FAMILY_QUERY_TRENDS = ['growing', 'stable', 'inactive'] as const;

export const familyQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(''),
  filters: z.object({
    memberIds: z.array(z.string().min(1).max(160)).max(100).optional(),
    relations: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    sides: z.array(z.enum(FAMILY_QUERY_SIDES)).max(5).optional(),
    generations: z.array(z.number().int().min(-8).max(8)).max(17).optional(),
    inferenceStatuses: z.array(z.enum(FAMILY_QUERY_INFERENCE)).max(3).optional(),
    trends: z.array(z.enum(FAMILY_QUERY_TRENDS)).max(3).optional(),
    householdNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    needsReview: z.boolean().optional(),
    hasCard: z.boolean().optional(),
    minEvidence: z.number().int().min(0).max(10_000).optional(),
  }).optional().default({}),
  sort: z.enum(['relevance', 'name_asc', 'generation', 'closeness_desc', 'evidence_desc']).optional().default('relevance'),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type FamilyQueryRequest = z.infer<typeof familyQueryRequestSchema>;

export type FamilyQueryResult = {
  characterId: string;
  name: string;
  relation: string;
  relationLabel: string;
  generation: number;
  side?: string | null;
  inferenceStatus?: string | null;
  closeness?: number | null;
  confidence: number;
  evidenceCount: number;
  mentionCount: number;
  trend?: string | null;
  householdNames: string[];
  hasCard: boolean;
  needsReview: boolean;
  matchedReasons: string[];
};

export type FamilyHouseholdQueryResult = {
  householdId: string;
  name: string;
  locationName?: string | null;
  headOfHousehold?: string | null;
  residentCount: number;
  matchedMemberNames: string[];
  confidence: number;
};

export type FamilyQueryResponse = {
  query: string;
  intent: 'browse' | 'person' | 'kinship' | 'branch' | 'household' | 'quality' | 'strength';
  results: FamilyQueryResult[];
  households: FamilyHouseholdQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    relations: Array<{ value: string; count: number }>;
    sides: Array<{ value: string; count: number }>;
    generations: Array<{ value: string; count: number }>;
    inferenceStatuses: Array<{ value: string; count: number }>;
    trends: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

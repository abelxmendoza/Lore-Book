import { z } from "zod";

export const PROJECT_QUERY_SCOPES = [
  "active",
  "paused",
  "completed",
  "abandoned",
  "recent",
  "dated",
  "important",
  "needs_review",
] as const;

export const PROJECT_QUERY_SORTS = [
  "relevance",
  "name_asc",
  "recent",
  "started_desc",
  "importance_desc",
] as const;

export const projectQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(""),
  filters: z
    .object({
      projectIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      names: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      types: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      statuses: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
      scopes: z.array(z.enum(PROJECT_QUERY_SCOPES)).max(8).optional(),
      hasDates: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      minImportance: z.number().min(0).max(100).optional(),
      startedOnOrAfter: z.string().trim().min(4).max(40).optional(),
      startedOnOrBefore: z.string().trim().min(4).max(40).optional(),
      updatedOnOrAfter: z.string().trim().min(4).max(40).optional(),
    })
    .optional()
    .default({}),
  sort: z.enum(PROJECT_QUERY_SORTS).optional().default("relevance"),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type ProjectQueryRequest = z.infer<typeof projectQueryRequestSchema>;
export type ProjectQueryScope = (typeof PROJECT_QUERY_SCOPES)[number];

export type ProjectQueryResult = {
  projectId: string;
  name: string;
  type: string;
  status: string;
  description?: string | null;
  summary?: string | null;
  tags: string[];
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt: string;
  importanceScore?: number | null;
  associatedCharacterCount: number;
  associatedLocationCount: number;
  source?: string | null;
  scopes: ProjectQueryScope[];
  needsReview: boolean;
  score: number;
  matchedReasons: string[];
};

export type ProjectQueryResponse = {
  query: string;
  intent: "browse" | "find" | "status" | "type" | "timeline" | "importance" | "quality";
  results: ProjectQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    types: Array<{ value: string; count: number }>;
    statuses: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
    scopes: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

import { z } from "zod";

export const CHARACTER_BOOK_QUERY_SCOPES = [
  "active",
  "inactive",
  "needs_review",
  "auto_detected",
  "self",
  "known",
  "similar",
] as const;

export const CHARACTER_BOOK_QUERY_SORTS = [
  "relevance",
  "name_asc",
  "recent",
  "importance_desc",
] as const;

export const characterBookQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(""),
  filters: z
    .object({
      characterIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      names: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      organizationNames: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      roles: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      statuses: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      scopes: z.array(z.enum(CHARACTER_BOOK_QUERY_SCOPES)).max(12).optional(),
      needsReview: z.boolean().optional(),
      excludeSelf: z.boolean().optional(),
    })
    .optional()
    .default({}),
  sort: z.enum(CHARACTER_BOOK_QUERY_SORTS).optional().default("relevance"),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type CharacterBookQueryRequest = z.infer<typeof characterBookQueryRequestSchema>;
export type CharacterBookQueryScope = (typeof CHARACTER_BOOK_QUERY_SCOPES)[number];
export type CharacterBookQuerySort = (typeof CHARACTER_BOOK_QUERY_SORTS)[number];

export type CharacterBookQueryResult = {
  characterId: string;
  name: string;
  aliases: string[];
  role?: string | null;
  status: string;
  tags: string[];
  summary?: string | null;
  isSelf: boolean;
  autoDetected: boolean;
  needsReview: boolean;
  organizationNames: string[];
  importanceScore: number;
  updatedAt?: string | null;
  scopes: CharacterBookQueryScope[];
  score: number;
  matchedReasons: string[];
};

export type CharacterBookQueryResponse = {
  query: string;
  intent: "browse" | "find" | "organization" | "quality" | "ranking" | "similar";
  results: CharacterBookQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    statuses: Array<{ value: string; count: number }>;
    roles: Array<{ value: string; count: number }>;
    organizations: Array<{ value: string; count: number }>;
    scopes: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

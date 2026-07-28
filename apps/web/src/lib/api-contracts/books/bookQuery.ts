import { z } from "zod";

export const BOOK_QUERY_DOMAINS = [
  "character",
  "organization",
  "family",
  "location",
  "romance",
  "project",
  "skill",
  "quest",
  "event",
  "document",
  "narrative",
] as const;

export type BookQueryDomain = (typeof BOOK_QUERY_DOMAINS)[number];

export const universalBookQueryRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  domains: z.array(z.enum(BOOK_QUERY_DOMAINS)).max(BOOK_QUERY_DOMAINS.length).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  perDomainLimit: z.number().int().min(1).max(50).optional().default(12),
  includeEvidence: z.boolean().optional().default(true),
});

export type UniversalBookQueryRequest = z.infer<typeof universalBookQueryRequestSchema>;

export type BookQueryEvidence = {
  sourceTable: string;
  sourceId: string;
  label: string;
  confidence?: number | null;
  observedAt?: string | null;
};

export type BookQueryRelatedEntity = {
  domain: BookQueryDomain;
  id?: string | null;
  name: string;
  relation: string;
};

export type UniversalBookQueryResult = {
  id: string;
  domain: BookQueryDomain;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  occurredAt?: string | null;
  updatedAt?: string | null;
  score: number;
  matchedReasons: string[];
  evidence: BookQueryEvidence[];
  relatedEntities: BookQueryRelatedEntity[];
};

export type BookQueryConnection = {
  fromId: string;
  toId: string;
  relation: string;
  reason: string;
};

export type UniversalBookQueryResponse = {
  query: string;
  intent: "find" | "status" | "relationship" | "timeline" | "quality" | "cross_book";
  results: UniversalBookQueryResult[];
  connections: BookQueryConnection[];
  groups: Array<{
    domain: BookQueryDomain;
    count: number;
    results: UniversalBookQueryResult[];
  }>;
  total: number;
  facets: {
    domains: Array<{ value: BookQueryDomain; count: number }>;
    statuses: Array<{ value: string; count: number }>;
  };
  warnings: string[];
  diagnostics: {
    queriedDomains: BookQueryDomain[];
    degradedDomains: BookQueryDomain[];
    elapsedMs: number;
  };
};

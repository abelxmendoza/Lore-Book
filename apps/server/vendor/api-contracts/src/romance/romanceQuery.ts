import { z } from "zod";

export const ROMANCE_QUERY_SCOPES = [
  "active",
  "past",
  "no_contact",
  "reconnection",
  "situationship",
  "crush",
  "dating",
  "high_risk",
  "needs_review",
] as const;

export const ROMANCE_QUERY_SORTS = [
  "relevance",
  "name_asc",
  "recent",
  "affection_desc",
  "compatibility_desc",
  "health_desc",
  "intensity_desc",
  "attachment_desc",
  "evidence_desc",
] as const;

export const romanceQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(""),
  filters: z
    .object({
      relationshipIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      personNames: z
        .array(z.string().trim().min(1).max(160))
        .max(30)
        .optional(),
      relationshipTypes: z
        .array(z.string().trim().min(1).max(80))
        .max(30)
        .optional(),
      statuses: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      scopes: z.array(z.enum(ROMANCE_QUERY_SCOPES)).max(9).optional(),
      exclusivityStatuses: z
        .array(z.string().trim().min(1).max(80))
        .max(10)
        .optional(),
      evidenceStrengths: z
        .array(z.enum(["none", "weak", "moderate", "strong"]))
        .max(4)
        .optional(),
      flagTerms: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      hasCharacterCard: z.boolean().optional(),
      scoresEvidenceBacked: z.boolean().optional(),
      minAffection: z.number().min(0).max(1).optional(),
      minCompatibility: z.number().min(0).max(1).optional(),
      minHealth: z.number().min(0).max(1).optional(),
      minIntensity: z.number().min(0).max(1).optional(),
      minAttachment: z.number().min(0).max(1).optional(),
      activeOnOrAfter: z.string().trim().min(4).max(40).optional(),
      activeOnOrBefore: z.string().trim().min(4).max(40).optional(),
    })
    .optional()
    .default({}),
  sort: z.enum(ROMANCE_QUERY_SORTS).optional().default("relevance"),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type RomanceQueryRequest = z.infer<typeof romanceQueryRequestSchema>;
export type RomanceQueryScope = (typeof ROMANCE_QUERY_SCOPES)[number];

export type RomanceQueryResult = {
  relationshipId: string;
  personId: string;
  personName: string;
  characterId?: string | null;
  relationshipType: string;
  status: string;
  isCurrent: boolean;
  isSituationship: boolean;
  exclusivityStatus?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  affectionScore?: number | null;
  compatibilityScore?: number | null;
  healthScore?: number | null;
  intensityScore?: number | null;
  attachmentScore?: number | null;
  obsessionScore?: number | null;
  evidenceStrength: "none" | "weak" | "moderate" | "strong";
  scoresEvidenceBacked: boolean;
  hasCharacterCard: boolean;
  greenFlags: string[];
  redFlags: string[];
  strengths: string[];
  weaknesses: string[];
  scopes: RomanceQueryScope[];
  needsReview: boolean;
  score: number;
  matchedReasons: string[];
};

export type RomanceQueryResponse = {
  query: string;
  intent:
    | "browse"
    | "person"
    | "status"
    | "connection"
    | "history"
    | "risk"
    | "quality"
    | "ranking";
  results: RomanceQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    relationshipTypes: Array<{ value: string; count: number }>;
    statuses: Array<{ value: string; count: number }>;
    scopes: Array<{ value: string; count: number }>;
    evidenceStrengths: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

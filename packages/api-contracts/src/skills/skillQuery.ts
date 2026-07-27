import { z } from "zod";

export const SKILL_QUERY_SCOPES = [
  "active",
  "inactive",
  "recent",
  "auto_detected",
  "paid",
  "hobby",
  "improving",
  "stagnant",
  "declining",
  "practiced",
  "unpracticed",
  "needs_review",
] as const;

export const SKILL_QUERY_SORTS = [
  "relevance",
  "name_asc",
  "recent",
  "level_desc",
  "xp_desc",
  "practice_desc",
  "proficiency_desc",
  "confidence_desc",
  "enjoyment_desc",
  "evidence_desc",
] as const;

export const skillQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(""),
  filters: z
    .object({
      skillIds: z.array(z.string().min(1).max(160)).max(100).optional(),
      names: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      categories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      skillTypes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      monetization: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
      trajectories: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
      usageFrequencies: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
      relatedProjects: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      relatedJobs: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      scopes: z.array(z.enum(SKILL_QUERY_SCOPES)).max(12).optional(),
      minLevel: z.number().int().min(1).max(100).optional(),
      minProficiency: z.number().min(0).max(100).optional(),
      minConfidence: z.number().min(0).max(1).optional(),
      minPracticeCount: z.number().int().min(0).max(1_000_000).optional(),
      minEvidenceCount: z.number().int().min(0).max(10_000).optional(),
      practicedOnOrAfter: z.string().trim().min(4).max(40).optional(),
      needsReview: z.boolean().optional(),
    })
    .optional()
    .default({}),
  sort: z.enum(SKILL_QUERY_SORTS).optional().default("relevance"),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type SkillQueryRequest = z.infer<typeof skillQueryRequestSchema>;
export type SkillQueryScope = (typeof SKILL_QUERY_SCOPES)[number];

export type SkillQueryResult = {
  skillId: string;
  name: string;
  category: string;
  description?: string | null;
  active: boolean;
  autoDetected: boolean;
  currentLevel: number;
  totalXp: number;
  practiceCount: number;
  confidenceScore: number;
  firstMentionedAt: string;
  lastPracticedAt?: string | null;
  skillType?: string | null;
  monetization?: string | null;
  proficiency?: number | null;
  enjoyment?: number | null;
  usageFrequency?: string | null;
  trajectory?: string | null;
  relatedProjects: string[];
  relatedJobs: string[];
  evidenceCount: number;
  scopes: SkillQueryScope[];
  needsReview: boolean;
  score: number;
  matchedReasons: string[];
};

export type SkillQueryResponse = {
  query: string;
  intent:
    | "browse"
    | "find"
    | "category"
    | "activity"
    | "growth"
    | "work"
    | "ranking"
    | "quality";
  results: SkillQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    categories: Array<{ value: string; count: number }>;
    skillTypes: Array<{ value: string; count: number }>;
    monetization: Array<{ value: string; count: number }>;
    trajectories: Array<{ value: string; count: number }>;
    scopes: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

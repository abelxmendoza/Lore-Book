import { z } from "zod";

export const QUEST_QUERY_SCOPES = [
  "active",
  "paused",
  "completed",
  "abandoned",
  "due_soon",
  "recent",
  "high_priority",
  "blocked",
  "needs_review",
] as const;

export const QUEST_QUERY_SORTS = [
  "relevance",
  "priority_desc",
  "progress_desc",
  "recent",
  "due_soon",
  "name_asc",
] as const;

export const questQueryRequestSchema = z.object({
  query: z.string().trim().max(500).optional().default(""),
  filters: z.object({
    questIds: z.array(z.string().min(1).max(160)).max(100).optional(),
    names: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    types: z.array(z.enum(["main", "side", "daily", "achievement"])).max(4).optional(),
    statuses: z.array(z.enum(["active", "paused", "completed", "abandoned", "archived"])).max(5).optional(),
    categories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    scopes: z.array(z.enum(QUEST_QUERY_SCOPES)).max(9).optional(),
    minPriority: z.number().min(1).max(10).optional(),
    minImportance: z.number().min(1).max(10).optional(),
    minImpact: z.number().min(1).max(10).optional(),
    minProgress: z.number().min(0).max(100).optional(),
    maxProgress: z.number().min(0).max(100).optional(),
    dueOnOrBefore: z.string().trim().min(4).max(40).optional(),
    updatedOnOrAfter: z.string().trim().min(4).max(40).optional(),
  }).optional().default({}),
  sort: z.enum(QUEST_QUERY_SORTS).optional().default("relevance"),
  limit: z.number().int().min(1).max(100).optional().default(30),
  offset: z.number().int().min(0).max(10_000).optional().default(0),
  includeFacets: z.boolean().optional().default(true),
});

export type QuestQueryRequest = z.infer<typeof questQueryRequestSchema>;
export type QuestQueryScope = (typeof QUEST_QUERY_SCOPES)[number];

export type QuestQueryResult = {
  questId: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  category?: string | null;
  tags: string[];
  priority: number;
  importance: number;
  impact: number;
  progress: number;
  dueAt?: string | null;
  lastActivityAt?: string | null;
  relatedGoalId?: string | null;
  relatedTaskId?: string | null;
  scopes: QuestQueryScope[];
  needsReview: boolean;
  score: number;
  matchedReasons: string[];
};

export type QuestQueryResponse = {
  query: string;
  intent: "browse" | "find" | "status" | "schedule" | "progress" | "priority" | "quality";
  results: QuestQueryResult[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    types: Array<{ value: string; count: number }>;
    statuses: Array<{ value: string; count: number }>;
    categories: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
    scopes: Array<{ value: string; count: number }>;
  };
  warnings: string[];
};

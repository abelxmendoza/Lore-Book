import type {
  QuestQueryRequest,
  QuestQueryResponse,
  QuestQueryResult,
  QuestQueryScope,
} from "@lorebook/api-contracts";

import type { Quest } from "./types";
import { questStorage } from "./questStorage";
import { BOOK_QUERY_SOURCE_ROW_CAP } from "../query/bookQuerySourceCaps";

const STOP_WORDS = new Set([
  "a", "all", "and", "are", "by", "find", "for", "how", "in", "is", "list",
  "me", "my", "of", "on", "quest", "quests", "show", "the", "to", "what", "which", "with",
]);
const STATUS_SCOPES = new Set<QuestQueryScope>(["active", "paused", "completed", "abandoned"]);

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function scopesFor(quest: Quest): QuestQueryScope[] {
  const scopes: QuestQueryScope[] = [];
  if (["active", "paused", "completed", "abandoned"].includes(quest.status)) {
    scopes.push(quest.status as QuestQueryScope);
  }
  const now = Date.now();
  const due = dateMs(quest.estimated_completion_date);
  if (due > 0 && due >= now - 86_400_000 && due <= now + 14 * 86_400_000) scopes.push("due_soon");
  if (dateMs(quest.last_activity_at ?? quest.updated_at) >= now - 30 * 86_400_000) scopes.push("recent");
  if (quest.priority >= 8 || quest.importance >= 8) scopes.push("high_priority");
  if (quest.metadata?.blocked === true || normalize(quest.metadata?.status_hint) === "blocked") scopes.push("blocked");
  if (!quest.description?.trim() || !quest.category || quest.metadata?.requires_review === true) scopes.push("needs_review");
  return unique(scopes);
}

export function deriveQuestQueryHints(query: string): {
  scopes: QuestQueryScope[];
  types: string[];
  sort?: QuestQueryRequest["sort"];
} {
  const text = normalize(query);
  const scopes: QuestQueryScope[] = [];
  if (/\b(active|current|ongoing|working on|in progress)\b/.test(text)) scopes.push("active");
  if (/\b(paused|on hold|shelved)\b/.test(text)) scopes.push("paused");
  if (/\b(completed|finished|done)\b/.test(text)) scopes.push("completed");
  if (/\b(abandoned|cancelled|canceled|dropped|gave up)\b/.test(text)) scopes.push("abandoned");
  if (/\b(due|deadline|upcoming|next two weeks)\b/.test(text)) scopes.push("due_soon");
  if (/\b(recent|recently|latest|updated)\b/.test(text)) scopes.push("recent");
  if (/\b(high priority|important|most important|urgent)\b/.test(text)) scopes.push("high_priority");
  if (/\b(blocked|stuck|blockers?)\b/.test(text)) scopes.push("blocked");
  if (/\b(needs? review|missing|uncertain|incomplete)\b/.test(text)) scopes.push("needs_review");
  const types = ["main", "side", "daily", "achievement"].filter((type) =>
    new RegExp(`\\b${type}\\s+quests?\\b`).test(text),
  );
  let sort: QuestQueryRequest["sort"] | undefined;
  if (/\b(highest priority|most important|priority order|urgent)\b/.test(text)) sort = "priority_desc";
  else if (/\b(most progress|furthest along)\b/.test(text)) sort = "progress_desc";
  else if (/\b(due|deadline|upcoming)\b/.test(text)) sort = "due_soon";
  else if (/\b(recent|latest|last updated)\b/.test(text)) sort = "recent";
  else if (/\b(alphabetical|a to z|a-z)\b/.test(text)) sort = "name_asc";
  return { scopes: unique(scopes), types, sort };
}

function facet(
  rows: QuestQueryResult[],
  read: (row: QuestQueryResult) => string[],
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of unique(read(row).filter(Boolean))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function compileQuestQuery(
  quests: Quest[],
  request: QuestQueryRequest,
): QuestQueryResponse {
  const hints = deriveQuestQueryHints(request.query);
  const filters = request.filters;
  const requestedScopes = unique([...(filters.scopes ?? []), ...hints.scopes]);
  const requestedTypes = unique([...(filters.types ?? []), ...hints.types]);
  const requestedStatusScopes = requestedScopes.filter((scope) => STATUS_SCOPES.has(scope));
  const requestedAttributeScopes = requestedScopes.filter((scope) => !STATUS_SCOPES.has(scope));
  const terms = normalize(request.query).split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  const matches = quests.flatMap<QuestQueryResult>((quest) => {
    const scopes = scopesFor(quest);
    const tags = quest.tags ?? [];
    if (filters.questIds?.length && !filters.questIds.includes(quest.id)) return [];
    if (filters.names?.length && !filters.names.some((name) => normalize(quest.title).includes(normalize(name)))) return [];
    if (requestedTypes.length && !requestedTypes.includes(quest.quest_type)) return [];
    if (filters.statuses?.length && !filters.statuses.includes(quest.status)) return [];
    if (filters.categories?.length && !filters.categories.some((value) => normalize(value) === normalize(quest.category))) return [];
    if (filters.tags?.length && !filters.tags.some((value) => tags.some((tag) => normalize(tag).includes(normalize(value))))) return [];
    if (requestedStatusScopes.length && !requestedStatusScopes.some((scope) => scopes.includes(scope))) return [];
    if (requestedAttributeScopes.some((scope) => !scopes.includes(scope))) return [];
    if (quest.priority < (filters.minPriority ?? 1)) return [];
    if (quest.importance < (filters.minImportance ?? 1)) return [];
    if (quest.impact < (filters.minImpact ?? 1)) return [];
    if (quest.progress_percentage < (filters.minProgress ?? 0)) return [];
    if (quest.progress_percentage > (filters.maxProgress ?? 100)) return [];
    if (filters.dueOnOrBefore && (!quest.estimated_completion_date || dateMs(quest.estimated_completion_date) > dateMs(filters.dueOnOrBefore))) return [];
    if (filters.updatedOnOrAfter && dateMs(quest.last_activity_at ?? quest.updated_at) < dateMs(filters.updatedOnOrAfter)) return [];

    const searchable = normalize([
      quest.title, quest.description, quest.quest_type, quest.status, quest.category, ...tags,
      quest.motivation_notes, quest.reward_description,
    ].join(" "));
    const matchedTerms = terms.filter((term) => searchable.includes(term));
    if (terms.length > 0 && matchedTerms.length === 0 && requestedScopes.length === 0 && requestedTypes.length === 0) return [];
    const reasons = [
      ...requestedScopes.filter((scope) => scopes.includes(scope)).map((scope) => `${scope.replace(/_/g, " ")} quest`),
      ...requestedTypes.filter((type) => type === quest.quest_type).map((type) => `${type} quest`),
      ...matchedTerms.slice(0, 3).map((term) => `matches "${term}"`),
    ];
    return [{
      questId: quest.id,
      title: quest.title,
      description: quest.description,
      type: quest.quest_type,
      status: quest.status,
      category: quest.category,
      tags,
      priority: quest.priority,
      importance: quest.importance,
      impact: quest.impact,
      progress: quest.progress_percentage,
      dueAt: quest.estimated_completion_date,
      lastActivityAt: quest.last_activity_at ?? quest.updated_at,
      relatedGoalId: quest.related_goal_id,
      relatedTaskId: quest.related_task_id,
      scopes,
      needsReview: scopes.includes("needs_review"),
      score: matchedTerms.length * 12 + requestedScopes.length * 10 + requestedTypes.length * 8 + quest.priority,
      matchedReasons: reasons.length ? reasons : [`${quest.quest_type} · ${quest.status}`],
    }];
  });

  const sort = request.sort === "relevance" ? (hints.sort ?? "relevance") : request.sort;
  if (sort === "priority_desc") matches.sort((a, b) => b.priority - a.priority || b.importance - a.importance);
  else if (sort === "progress_desc") matches.sort((a, b) => b.progress - a.progress);
  else if (sort === "recent") matches.sort((a, b) => dateMs(b.lastActivityAt) - dateMs(a.lastActivityAt));
  else if (sort === "due_soon") matches.sort((a, b) => (dateMs(a.dueAt) || Infinity) - (dateMs(b.dueAt) || Infinity));
  else if (sort === "name_asc") matches.sort((a, b) => a.title.localeCompare(b.title));
  else matches.sort((a, b) => b.score - a.score || b.priority - a.priority);

  const total = matches.length;
  const warnings: string[] = [];
  if (matches.some((row) => row.needsReview)) warnings.push("Some matching quests need a description, category, or evidence review.");
  if (requestedScopes.includes("blocked") && matches.length === 0) warnings.push("No quests are explicitly marked blocked; LoreBook will not infer a blocker without evidence.");
  return {
    query: request.query,
    intent: requestedScopes.includes("needs_review") ? "quality"
      : requestedScopes.includes("due_soon") ? "schedule"
      : requestedScopes.includes("high_priority") ? "priority"
      : /\b(progress|furthest|percent)\b/i.test(request.query) ? "progress"
      : requestedScopes.some((scope) => ["active", "paused", "completed", "abandoned"].includes(scope)) ? "status"
      : request.query.trim() ? "find" : "browse",
    results: matches.slice(request.offset, request.offset + request.limit),
    total,
    limit: request.limit,
    offset: request.offset,
    facets: request.includeFacets ? {
      types: facet(matches, (row) => [row.type]),
      statuses: facet(matches, (row) => [row.status]),
      categories: facet(matches, (row) => row.category ? [row.category] : []),
      tags: facet(matches, (row) => row.tags),
      scopes: facet(matches, (row) => row.scopes),
    } : { types: [], statuses: [], categories: [], tags: [], scopes: [] },
    warnings,
  };
}

export async function queryQuestsForUser(
  userId: string,
  request: QuestQueryRequest,
): Promise<QuestQueryResponse> {
  return compileQuestQuery(await questStorage.getQuests(userId, { limit: BOOK_QUERY_SOURCE_ROW_CAP }), request);
}

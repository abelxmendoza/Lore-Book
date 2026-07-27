import type {
  ProjectQueryRequest,
  ProjectQueryResponse,
  ProjectQueryResult,
  ProjectQueryScope,
} from "@lorebook/api-contracts";

import { projectService, type ProjectRow } from "../projectService";

const STATUS_SCOPES = ["active", "paused", "completed", "abandoned"] as const;
const PROJECT_TYPES = [
  "software",
  "business",
  "creative",
  "fitness",
  "education",
  "career",
  "hobby",
  "project",
] as const;
const STOP_WORDS = new Set([
  "a",
  "all",
  "and",
  "are",
  "by",
  "find",
  "for",
  "how",
  "in",
  "is",
  "list",
  "me",
  "my",
  "of",
  "on",
  "project",
  "projects",
  "show",
  "the",
  "to",
  "what",
  "which",
  "with",
]);

type ProjectQueryHints = {
  scopes: ProjectQueryScope[];
  types: string[];
  tags: string[];
  year?: number;
  sort?: ProjectQueryRequest["sort"];
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function includesAny(value: string, needles: string[] | undefined): boolean {
  if (!needles?.length) return true;
  const normalized = normalize(value);
  return needles.some((needle) => normalized.includes(normalize(needle)));
}

function overlaps(values: string[], needles: string[] | undefined): boolean {
  if (!needles?.length) return true;
  const haystack = values.map(normalize);
  return needles.some((needle) => haystack.some((value) => value.includes(normalize(needle))));
}

export function deriveProjectQueryHints(query: string): ProjectQueryHints {
  const text = normalize(query);
  const scopes: ProjectQueryScope[] = [];
  if (/\b(active|current|ongoing|working on|in progress)\b/.test(text)) scopes.push("active");
  if (/\b(paused|on hold|shelved)\b/.test(text)) scopes.push("paused");
  if (/\b(completed|finished|done|shipped)\b/.test(text)) scopes.push("completed");
  if (/\b(abandoned|cancelled|canceled|dropped|gave up)\b/.test(text)) scopes.push("abandoned");
  if (/\b(recent|recently|latest|updated lately|newest)\b/.test(text)) scopes.push("recent");
  if (/\b(with dates?|dated|timeline|started|ended)\b/.test(text)) scopes.push("dated");
  if (
    /\b(important|major|priority)\b/.test(text) &&
    !/\b(most important|highest importance|rank|compare|highest priority)\b/.test(text)
  ) {
    scopes.push("important");
  }
  if (/\b(needs? review|missing|uncertain|incomplete|fallback)\b/.test(text)) scopes.push("needs_review");

  const types = PROJECT_TYPES.filter((type) =>
    new RegExp(`\\b${type.replace("_", "\\s+")}\\b`, "i").test(query),
  );
  const tag = query.match(/\b(?:tagged?|tag)\s+(?:with\s+)?["']?([\p{L}\p{N}_-]+)["']?/iu)?.[1];
  const yearText = query.match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  const year = yearText ? Number(yearText) : undefined;

  let sort: ProjectQueryRequest["sort"] | undefined;
  if (/\b(most important|highest importance|priority)\b/.test(text)) sort = "importance_desc";
  else if (/\b(recent|recently|latest|newest|last updated)\b/.test(text)) sort = "recent";
  else if (/\b(newest started|started most recently)\b/.test(text)) sort = "started_desc";
  else if (/\b(alphabetical|a to z|a-z)\b/.test(text)) sort = "name_asc";

  return { scopes: unique(scopes), types, tags: tag ? [tag] : [], year, sort };
}

function scopesFor(row: ProjectRow): ProjectQueryScope[] {
  const scopes: ProjectQueryScope[] = [];
  const status = normalize(row.status || "active");
  if (STATUS_SCOPES.includes(status as (typeof STATUS_SCOPES)[number])) {
    scopes.push(status as (typeof STATUS_SCOPES)[number]);
  }
  if (dateMs(row.updated_at) >= Date.now() - 90 * 86_400_000) scopes.push("recent");
  if (row.started_at || row.ended_at) scopes.push("dated");
  if ((row.importance_score ?? 0) >= 70) scopes.push("important");
  if (
    row.metadata?.source === "organizations_fallback" ||
    !row.description?.trim() ||
    !row.type ||
    !row.status
  ) {
    scopes.push("needs_review");
  }
  return unique(scopes);
}

function intentFor(
  hints: ProjectQueryHints,
  request: ProjectQueryRequest,
): ProjectQueryResponse["intent"] {
  const scopes = unique([...(request.filters.scopes ?? []), ...hints.scopes]);
  if (scopes.includes("needs_review")) return "quality";
  if (scopes.includes("important") || request.filters.minImportance !== undefined) return "importance";
  if (hints.year || scopes.includes("recent") || scopes.includes("dated")) return "timeline";
  if (request.filters.statuses?.length || scopes.some((scope) => STATUS_SCOPES.includes(scope as never))) {
    return "status";
  }
  if (request.filters.types?.length || hints.types.length) return "type";
  if (request.query.trim()) return "find";
  return "browse";
}

function facet(
  rows: ProjectQueryResult[],
  read: (row: ProjectQueryResult) => string[],
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of unique(read(row).filter(Boolean))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function compileProjectQuery(
  rows: ProjectRow[],
  request: ProjectQueryRequest,
): ProjectQueryResponse {
  const hints = deriveProjectQueryHints(request.query);
  const filters = request.filters;
  const requestedScopes = unique([...(filters.scopes ?? []), ...hints.scopes]);
  const requestedTypes = unique([...(filters.types ?? []), ...hints.types]);
  const requestedTags = unique([...(filters.tags ?? []), ...hints.tags]);
  const queryTerms = normalize(request.query)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  const matches = rows.flatMap<ProjectQueryResult>((row) => {
    const scopes = scopesFor(row);
    const status = normalize(row.status || "active");
    const type = normalize(row.type || "project");
    const tags = row.tags ?? [];
    if (filters.projectIds?.length && !filters.projectIds.includes(row.id)) return [];
    if (!includesAny(row.name, filters.names)) return [];
    if (requestedTypes.length && !requestedTypes.some((value) => type === normalize(value))) return [];
    if (filters.statuses?.length && !filters.statuses.some((value) => status === normalize(value))) return [];
    if (requestedTags.length && !overlaps(tags, requestedTags)) return [];
    if (requestedScopes.some((scope) => !scopes.includes(scope))) return [];
    if (filters.hasDates !== undefined && Boolean(row.started_at || row.ended_at) !== filters.hasDates) return [];
    const needsReview = scopes.includes("needs_review");
    if (filters.needsReview !== undefined && needsReview !== filters.needsReview) return [];
    if ((row.importance_score ?? 0) < (filters.minImportance ?? 0)) return [];
    if (filters.startedOnOrAfter && dateMs(row.started_at) < dateMs(filters.startedOnOrAfter)) return [];
    if (filters.startedOnOrBefore && dateMs(row.started_at) > dateMs(filters.startedOnOrBefore)) return [];
    if (filters.updatedOnOrAfter && dateMs(row.updated_at) < dateMs(filters.updatedOnOrAfter)) return [];
    if (hints.year) {
      const startYear = row.started_at ? new Date(row.started_at).getFullYear() : null;
      const endYear = row.ended_at ? new Date(row.ended_at).getFullYear() : null;
      if (startYear === null || hints.year < startYear || hints.year > (endYear ?? 9999)) return [];
    }

    const searchable = normalize([
      row.name,
      row.type,
      row.status,
      row.description,
      row.summary,
      ...tags,
    ].join(" "));
    const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
    const reasons = [
      ...requestedScopes.filter((scope) => scopes.includes(scope)).map((scope) => `${scope.replace(/_/g, " ")} project`),
      ...requestedTypes.filter((value) => type === normalize(value)).map((value) => `${value} project`),
      ...requestedTags.filter((value) => overlaps(tags, [value])).map((value) => `tagged ${value}`),
      hints.year ? `active during ${hints.year}` : null,
      ...matchedTerms.slice(0, 3).map((term) => `matches "${term}"`),
    ].filter((reason): reason is string => Boolean(reason));
    const score =
      matchedTerms.length * 12 +
      requestedScopes.filter((scope) => scopes.includes(scope)).length * 10 +
      requestedTypes.filter((value) => type === normalize(value)).length * 8 +
      requestedTags.filter((value) => overlaps(tags, [value])).length * 8;

    return [{
      projectId: row.id,
      name: row.name,
      type,
      status,
      description: row.description,
      summary: row.summary,
      tags,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      updatedAt: row.updated_at,
      importanceScore: row.importance_score,
      associatedCharacterCount: row.associated_character_ids?.length ?? 0,
      associatedLocationCount: row.associated_location_ids?.length ?? 0,
      source: typeof row.metadata?.source === "string" ? row.metadata.source : null,
      scopes,
      needsReview,
      score,
      matchedReasons: reasons.length ? reasons : [`${type} · ${status}`],
    }];
  });

  const sort = request.sort === "relevance" ? (hints.sort ?? "relevance") : request.sort;
  if (sort === "name_asc") matches.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "recent") matches.sort((a, b) => dateMs(b.updatedAt) - dateMs(a.updatedAt));
  else if (sort === "started_desc") matches.sort((a, b) => dateMs(b.startedAt) - dateMs(a.startedAt));
  else if (sort === "importance_desc") {
    matches.sort((a, b) => (b.importanceScore ?? -1) - (a.importanceScore ?? -1));
  } else {
    matches.sort((a, b) => b.score - a.score || dateMs(b.updatedAt) - dateMs(a.updatedAt));
  }

  const total = matches.length;
  const results = matches.slice(request.offset, request.offset + request.limit);
  const warnings: string[] = [];
  if (matches.some((row) => row.source === "organizations_fallback")) {
    warnings.push("Some rows are temporary organization fallbacks and need project review.");
  }
  if (sort === "importance_desc" && matches.some((row) => row.importanceScore == null)) {
    warnings.push("Projects without a grounded importance score are ranked last.");
  }

  return {
    query: request.query,
    intent: intentFor(hints, request),
    results,
    total,
    limit: request.limit,
    offset: request.offset,
    facets: request.includeFacets
      ? {
          types: facet(matches, (row) => [row.type]),
          statuses: facet(matches, (row) => [row.status]),
          tags: facet(matches, (row) => row.tags),
          scopes: facet(matches, (row) => row.scopes),
        }
      : { types: [], statuses: [], tags: [], scopes: [] },
    warnings,
  };
}

export async function queryProjectsForUser(
  userId: string,
  request: ProjectQueryRequest,
): Promise<ProjectQueryResponse> {
  const rows = await projectService.listProjects(userId);
  return compileProjectQuery(rows, request);
}

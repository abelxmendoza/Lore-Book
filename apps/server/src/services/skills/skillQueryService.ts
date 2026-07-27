import type {
  SkillQueryRequest,
  SkillQueryResponse,
  SkillQueryResult,
  SkillQueryScope,
} from "@lorebook/api-contracts";

import { readSkillProfile } from "./skillProfile";
import { skillService, type Skill } from "./skillService";

const SKILL_CATEGORIES = [
  "professional",
  "creative",
  "physical",
  "social",
  "intellectual",
  "emotional",
  "practical",
  "artistic",
  "technical",
  "other",
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
  "show",
  "skill",
  "skills",
  "the",
  "to",
  "what",
  "which",
  "with",
]);

type SkillQueryHints = {
  scopes: SkillQueryScope[];
  categories: string[];
  relatedProjects: string[];
  sort?: SkillQueryRequest["sort"];
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

function overlaps(values: string[], needles: string[] | undefined): boolean {
  if (!needles?.length) return true;
  const haystack = values.map(normalize);
  return needles.some((needle) => haystack.some((value) => value.includes(normalize(needle))));
}

function isPrimarySkill(row: Skill): boolean {
  const metadata = row.metadata ?? {};
  const entityType = normalize(metadata.capability_entity_type || "skill").toUpperCase();
  const archived =
    metadata.archived === true || normalize(metadata.migration_status).startsWith("archive");
  if (archived || metadata.skill_book_visible === false) return false;
  if (row.is_active === false && metadata.migration_status) return false;
  return entityType === "SKILL";
}

export function deriveSkillQueryHints(query: string): SkillQueryHints {
  const text = normalize(query);
  const scopes: SkillQueryScope[] = [];
  if (/\b(active|current|still use|still practice)\b/.test(text)) scopes.push("active");
  if (/\b(inactive|not using|stopped using|retired)\b/.test(text)) scopes.push("inactive");
  if (/\b(recent|recently|lately|latest)\b/.test(text)) scopes.push("recent");
  if (/\b(auto detected|automatically detected|inferred)\b/.test(text)) scopes.push("auto_detected");
  if (/\b(paid|make money|monetize|monetized|professional income)\b/.test(text)) scopes.push("paid");
  if (/\b(hobby|for fun|personal)\b/.test(text)) scopes.push("hobby");
  if (/\b(improving|growing|getting better|growth)\b/.test(text)) scopes.push("improving");
  if (/\b(stagnant|plateau|plateaued)\b/.test(text)) scopes.push("stagnant");
  if (/\b(declining|getting worse|rusty)\b/.test(text)) scopes.push("declining");
  if (/\b(practiced|used|experience with)\b/.test(text)) scopes.push("practiced");
  if (/\b(unpracticed|never practiced|no practice)\b/.test(text)) scopes.push("unpracticed");
  if (/\b(needs? review|weak evidence|low confidence|uncertain|missing evidence)\b/.test(text)) {
    scopes.push("needs_review");
  }

  const categories = SKILL_CATEGORIES.filter((category) =>
    new RegExp(`\\b${category}\\b`, "i").test(query),
  );
  const relatedProject = query.match(
    /\b(?:skills?.*?\b(?:for|on|in)|use(?:d)?\s+(?:for|on|in)|needed\s+(?:for|on|in)|required\s+(?:for|on|in)|related\s+to)\s+(.+?)\??$/i,
  )?.[1]?.trim();

  let sort: SkillQueryRequest["sort"] | undefined;
  if (/\b(highest|best|strongest|most proficient)\b.*\b(skill|skills|proficiency)\b/.test(text)) {
    sort = "proficiency_desc";
  } else if (/\b(highest level|top level)\b/.test(text)) sort = "level_desc";
  else if (/\b(most practiced|use most|most used)\b/.test(text)) sort = "practice_desc";
  else if (/\b(most experience|highest xp)\b/.test(text)) sort = "xp_desc";
  else if (/\b(highest confidence|most certain)\b/.test(text)) sort = "confidence_desc";
  else if (/\b(most enjoy|favorite skills?)\b/.test(text)) sort = "enjoyment_desc";
  else if (/\b(strongest evidence|most evidence)\b/.test(text)) sort = "evidence_desc";
  else if (/\b(recent|recently|latest|last practiced)\b/.test(text)) sort = "recent";
  else if (/\b(alphabetical|a to z|a-z)\b/.test(text)) sort = "name_asc";

  return {
    scopes: unique(scopes),
    categories,
    relatedProjects: relatedProject ? [relatedProject] : [],
    sort,
  };
}

function scopesFor(row: Skill): SkillQueryScope[] {
  const profile = readSkillProfile(row.metadata);
  const scopes: SkillQueryScope[] = [row.is_active ? "active" : "inactive"];
  if (dateMs(row.last_practiced_at) >= Date.now() - 90 * 86_400_000) scopes.push("recent");
  if (row.auto_detected) scopes.push("auto_detected");
  if (profile?.monetization === "paid" || profile?.monetization === "potentially_paid") scopes.push("paid");
  if (profile?.monetization === "hobby_only" || profile?.skill_type === "hobby") scopes.push("hobby");
  if (profile?.trajectory === "improving") scopes.push("improving");
  if (profile?.trajectory === "stagnant") scopes.push("stagnant");
  if (profile?.trajectory === "declining") scopes.push("declining");
  scopes.push(row.practice_count > 0 ? "practiced" : "unpracticed");
  if (
    row.confidence_score < 0.6 ||
    (row.auto_detected && (profile?.evidence?.length ?? 0) === 0) ||
    !row.description?.trim()
  ) {
    scopes.push("needs_review");
  }
  return unique(scopes);
}

function intentFor(
  hints: SkillQueryHints,
  request: SkillQueryRequest,
): SkillQueryResponse["intent"] {
  const scopes = unique([...(request.filters.scopes ?? []), ...hints.scopes]);
  if (scopes.includes("needs_review")) return "quality";
  if (request.sort !== "relevance" || hints.sort?.endsWith("_desc")) return "ranking";
  if (request.filters.relatedProjects?.length || hints.relatedProjects.length) return "find";
  if (scopes.some((scope) => ["improving", "stagnant", "declining"].includes(scope))) return "growth";
  if (scopes.some((scope) => ["recent", "practiced", "unpracticed"].includes(scope))) return "activity";
  if (scopes.some((scope) => ["paid", "hobby"].includes(scope)) || request.filters.relatedJobs?.length) {
    return "work";
  }
  if (request.filters.categories?.length || hints.categories.length) return "category";
  if (request.query.trim()) return "find";
  return "browse";
}

function facet(
  rows: SkillQueryResult[],
  read: (row: SkillQueryResult) => string[],
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

export function compileSkillQuery(
  inputRows: Skill[],
  request: SkillQueryRequest,
): SkillQueryResponse {
  const rows = inputRows.filter(isPrimarySkill);
  const hints = deriveSkillQueryHints(request.query);
  const filters = request.filters;
  const requestedScopes = unique([...(filters.scopes ?? []), ...hints.scopes]);
  const requestedCategories = unique([...(filters.categories ?? []), ...hints.categories]);
  const requestedProjects = unique([...(filters.relatedProjects ?? []), ...hints.relatedProjects]);
  const queryTerms = normalize(request.query)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  const matches = rows.flatMap<SkillQueryResult>((row) => {
    const profile = readSkillProfile(row.metadata);
    const scopes = scopesFor(row);
    const relatedProjects = profile?.related_projects ?? [];
    const relatedJobs = profile?.related_jobs ?? [];
    const evidenceCount = profile?.evidence?.length ?? 0;
    if (filters.skillIds?.length && !filters.skillIds.includes(row.id)) return [];
    if (filters.names?.length && !filters.names.some((name) => normalize(row.skill_name).includes(normalize(name)))) return [];
    if (requestedCategories.length && !requestedCategories.some((value) => normalize(value) === normalize(row.skill_category))) return [];
    if (filters.skillTypes?.length && !filters.skillTypes.some((value) => normalize(value) === normalize(profile?.skill_type))) return [];
    if (filters.monetization?.length && !filters.monetization.some((value) => normalize(value) === normalize(profile?.monetization))) return [];
    if (filters.trajectories?.length && !filters.trajectories.some((value) => normalize(value) === normalize(profile?.trajectory))) return [];
    if (filters.usageFrequencies?.length && !filters.usageFrequencies.some((value) => normalize(value) === normalize(profile?.usage_frequency))) return [];
    if (!overlaps(relatedProjects, requestedProjects)) return [];
    if (!overlaps(relatedJobs, filters.relatedJobs)) return [];
    if (requestedScopes.some((scope) => !scopes.includes(scope))) return [];
    const needsReview = scopes.includes("needs_review");
    if (filters.needsReview !== undefined && needsReview !== filters.needsReview) return [];
    if (row.current_level < (filters.minLevel ?? 1)) return [];
    if ((profile?.proficiency ?? 0) < (filters.minProficiency ?? 0)) return [];
    if (row.confidence_score < (filters.minConfidence ?? 0)) return [];
    if (row.practice_count < (filters.minPracticeCount ?? 0)) return [];
    if (evidenceCount < (filters.minEvidenceCount ?? 0)) return [];
    if (filters.practicedOnOrAfter && dateMs(row.last_practiced_at) < dateMs(filters.practicedOnOrAfter)) return [];

    const searchable = normalize([
      row.skill_name,
      row.skill_category,
      row.description,
      profile?.skill_type,
      profile?.monetization,
      profile?.trajectory,
      profile?.origin_story,
      profile?.first_learned_context,
      ...relatedProjects,
      ...relatedJobs,
    ].join(" "));
    const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
    const reasons = [
      ...requestedScopes.filter((scope) => scopes.includes(scope)).map((scope) => scope.replace(/_/g, " ")),
      ...requestedCategories.filter((value) => normalize(value) === normalize(row.skill_category)).map((value) => `${value} skill`),
      ...requestedProjects.filter((value) => overlaps(relatedProjects, [value])).map((value) => `used for ${value}`),
      ...matchedTerms.slice(0, 3).map((term) => `matches "${term}"`),
    ].filter(Boolean);
    const score =
      matchedTerms.length * 12 +
      requestedScopes.filter((scope) => scopes.includes(scope)).length * 10 +
      requestedCategories.filter((value) => normalize(value) === normalize(row.skill_category)).length * 8 +
      requestedProjects.filter((value) => overlaps(relatedProjects, [value])).length * 10;

    return [{
      skillId: row.id,
      name: row.skill_name,
      category: row.skill_category,
      description: row.description,
      active: row.is_active,
      autoDetected: row.auto_detected,
      currentLevel: row.current_level,
      totalXp: row.total_xp,
      practiceCount: row.practice_count,
      confidenceScore: row.confidence_score,
      firstMentionedAt: row.first_mentioned_at,
      lastPracticedAt: row.last_practiced_at,
      skillType: profile?.skill_type ?? null,
      monetization: profile?.monetization ?? null,
      proficiency: profile?.proficiency ?? null,
      enjoyment: profile?.enjoyment ?? null,
      usageFrequency: profile?.usage_frequency ?? null,
      trajectory: profile?.trajectory ?? null,
      relatedProjects,
      relatedJobs,
      evidenceCount,
      scopes,
      needsReview,
      score,
      matchedReasons: reasons.length ? reasons : [`${row.skill_category} · level ${row.current_level}`],
    }];
  });

  const sort = request.sort === "relevance" ? (hints.sort ?? "relevance") : request.sort;
  if (sort === "name_asc") matches.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "recent") matches.sort((a, b) => dateMs(b.lastPracticedAt) - dateMs(a.lastPracticedAt));
  else if (sort === "level_desc") matches.sort((a, b) => b.currentLevel - a.currentLevel);
  else if (sort === "xp_desc") matches.sort((a, b) => b.totalXp - a.totalXp);
  else if (sort === "practice_desc") matches.sort((a, b) => b.practiceCount - a.practiceCount);
  else if (sort === "proficiency_desc") {
    matches.sort(
      (a, b) =>
        Number(b.evidenceCount > 0) - Number(a.evidenceCount > 0) ||
        (b.proficiency ?? -1) - (a.proficiency ?? -1),
    );
  }
  else if (sort === "confidence_desc") matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  else if (sort === "enjoyment_desc") {
    matches.sort(
      (a, b) =>
        Number(b.evidenceCount > 0) - Number(a.evidenceCount > 0) ||
        (b.enjoyment ?? -1) - (a.enjoyment ?? -1),
    );
  }
  else if (sort === "evidence_desc") matches.sort((a, b) => b.evidenceCount - a.evidenceCount);
  else matches.sort((a, b) => b.score - a.score || b.practiceCount - a.practiceCount);

  const total = matches.length;
  const results = matches.slice(request.offset, request.offset + request.limit);
  const warnings: string[] = [];
  if (
    ["proficiency_desc", "enjoyment_desc"].includes(sort) &&
    matches.some((row) => row.evidenceCount === 0)
  ) {
    warnings.push("Inferred skill scores without supporting evidence are ranked after grounded scores.");
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
          categories: facet(matches, (row) => [row.category]),
          skillTypes: facet(matches, (row) => row.skillType ? [row.skillType] : []),
          monetization: facet(matches, (row) => row.monetization ? [row.monetization] : []),
          trajectories: facet(matches, (row) => row.trajectory ? [row.trajectory] : []),
          scopes: facet(matches, (row) => row.scopes),
        }
      : { categories: [], skillTypes: [], monetization: [], trajectories: [], scopes: [] },
    warnings,
  };
}

export async function querySkillsForUser(
  userId: string,
  request: SkillQueryRequest,
): Promise<SkillQueryResponse> {
  const rows = await skillService.getSkills(userId, { active_only: false });
  return compileSkillQuery(rows, request);
}

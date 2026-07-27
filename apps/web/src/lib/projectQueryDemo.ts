import type { ProjectCardData } from "../components/projects/ProjectProfileCard";

import type { ProjectQueryResponse, ProjectQueryScope } from "./api-contracts";
function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function scopesFor(project: ProjectCardData): ProjectQueryScope[] {
  const scopes: ProjectQueryScope[] = [];
  const status = normalize(project.status || "active");
  if (["active", "paused", "completed", "abandoned"].includes(status)) {
    scopes.push(status as ProjectQueryScope);
  }
  if (Date.parse(project.updated_at) >= Date.now() - 90 * 86_400_000) scopes.push("recent");
  if (project.started_at || project.ended_at) scopes.push("dated");
  if ((project.importance_score ?? 0) >= 70) scopes.push("important");
  if (
    project.metadata?.source === "organizations_fallback" ||
    !project.description?.trim() ||
    !project.type ||
    !project.status
  ) {
    scopes.push("needs_review");
  }
  return [...new Set(scopes)];
}

export function compileDemoProjectQuery(
  projects: ProjectCardData[],
  query: string,
): ProjectQueryResponse {
  const normalized = normalize(query);
  const scopes: ProjectQueryScope[] = [];
  if (/\b(active|current|ongoing|in progress)\b/.test(normalized)) scopes.push("active");
  if (/\b(paused|on hold|shelved)\b/.test(normalized)) scopes.push("paused");
  if (/\b(completed|finished|done|shipped)\b/.test(normalized)) scopes.push("completed");
  if (/\b(abandoned|cancelled|canceled|dropped)\b/.test(normalized)) scopes.push("abandoned");
  if (/\b(recent|recently|latest|newest)\b/.test(normalized)) scopes.push("recent");
  if (/\b(needs? review|missing|uncertain|incomplete)\b/.test(normalized)) scopes.push("needs_review");
  const type = ["software", "business", "creative", "fitness", "education", "career", "hobby"]
    .find((value) => new RegExp(`\\b${value}\\b`).test(normalized));
  const yearText = query.match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  const year = yearText ? Number(yearText) : null;
  const wantsImportance = /\b(most important|highest importance|priority)\b/.test(normalized);

  const results = projects.flatMap((project) => {
    const projectScopes = scopesFor(project);
    if (scopes.some((scope) => !projectScopes.includes(scope))) return [];
    if (type && normalize(project.type) !== type) return [];
    if (year) {
      const start = project.started_at ? new Date(project.started_at).getFullYear() : null;
      const end = project.ended_at ? new Date(project.ended_at).getFullYear() : 9999;
      if (start === null || year < start || year > end) return [];
    }
    const reasons = [
      ...scopes.map((scope) => `${scope.replace(/_/g, " ")} project`),
      type ? `${type} project` : null,
      year ? `active during ${year}` : null,
    ].filter((reason): reason is string => Boolean(reason));
    return [{
      projectId: project.id,
      name: project.name,
      type: normalize(project.type || "project"),
      status: normalize(project.status || "active"),
      description: project.description,
      summary: project.summary,
      tags: project.tags ?? [],
      startedAt: project.started_at,
      endedAt: project.ended_at,
      updatedAt: project.updated_at,
      importanceScore: project.importance_score,
      associatedCharacterCount: 0,
      associatedLocationCount: 0,
      source: project.metadata?.source ?? null,
      scopes: projectScopes,
      needsReview: projectScopes.includes("needs_review"),
      score: reasons.length * 10,
      matchedReasons: reasons.length
        ? reasons
        : [`${normalize(project.type || "project")} · ${normalize(project.status || "active")}`],
    }];
  });

  if (wantsImportance) {
    results.sort((a, b) => (b.importanceScore ?? -1) - (a.importanceScore ?? -1));
  } else if (scopes.includes("recent")) {
    results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  return {
    query,
    intent: scopes.includes("needs_review")
      ? "quality"
      : wantsImportance
        ? "importance"
        : year || scopes.includes("recent")
          ? "timeline"
          : scopes.length
            ? "status"
            : type
              ? "type"
              : query.trim()
                ? "find"
                : "browse",
    results,
    total: results.length,
    limit: 100,
    offset: 0,
    facets: { types: [], statuses: [], tags: [], scopes: [] },
    warnings:
      wantsImportance && results.some((project) => project.importanceScore == null)
        ? ["Projects without a grounded importance score are ranked last."]
        : [],
  };
}

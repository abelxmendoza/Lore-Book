import type { Skill } from "../types/skill";

import type { SkillQueryResponse, SkillQueryScope } from "./api-contracts";
import { isPrimarySkillBookRecord } from "./skillOntology";
import { readSkillProfile } from "./skillProfile";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function scopesFor(skill: Skill): SkillQueryScope[] {
  const profile = readSkillProfile(skill.metadata);
  const scopes: SkillQueryScope[] = [skill.is_active ? "active" : "inactive"];
  if (skill.last_practiced_at && Date.parse(skill.last_practiced_at) >= Date.now() - 90 * 86_400_000) {
    scopes.push("recent");
  }
  if (skill.auto_detected) scopes.push("auto_detected");
  if (profile?.monetization === "paid" || profile?.monetization === "potentially_paid") scopes.push("paid");
  if (profile?.monetization === "hobby_only" || profile?.skill_type === "hobby") scopes.push("hobby");
  if (profile?.trajectory === "improving") scopes.push("improving");
  if (profile?.trajectory === "stagnant") scopes.push("stagnant");
  if (profile?.trajectory === "declining") scopes.push("declining");
  scopes.push(skill.practice_count > 0 ? "practiced" : "unpracticed");
  if (
    skill.confidence_score < 0.6 ||
    (skill.auto_detected && (profile?.evidence?.length ?? 0) === 0) ||
    !skill.description?.trim()
  ) {
    scopes.push("needs_review");
  }
  return [...new Set(scopes)];
}

export function compileDemoSkillQuery(skills: Skill[], query: string): SkillQueryResponse {
  const normalized = normalize(query);
  const scopes: SkillQueryScope[] = [];
  if (/\b(active|current)\b/.test(normalized)) scopes.push("active");
  if (/\b(inactive|retired)\b/.test(normalized)) scopes.push("inactive");
  if (/\b(recent|recently|lately)\b/.test(normalized)) scopes.push("recent");
  if (/\b(paid|make money|monetize)\b/.test(normalized)) scopes.push("paid");
  if (/\b(hobby|for fun)\b/.test(normalized)) scopes.push("hobby");
  if (/\b(improving|growing|getting better)\b/.test(normalized)) scopes.push("improving");
  if (/\b(stagnant|plateau)\b/.test(normalized)) scopes.push("stagnant");
  if (/\b(declining|rusty)\b/.test(normalized)) scopes.push("declining");
  if (/\b(needs? review|weak evidence|low confidence|missing evidence)\b/.test(normalized)) {
    scopes.push("needs_review");
  }
  const category = [
    "professional",
    "creative",
    "physical",
    "social",
    "intellectual",
    "emotional",
    "practical",
    "artistic",
    "technical",
  ].find((value) => new RegExp(`\\b${value}\\b`).test(normalized));
  const relatedProject = query.match(
    /\b(?:skills?.*?\b(?:for|on|in)|use(?:d)?\s+(?:for|on|in))\s+(.+?)\??$/i,
  )?.[1]?.trim();
  const sort = /\b(strongest|most proficient|by proficiency)\b/.test(normalized)
    ? "proficiency"
    : /\b(highest level|by level)\b/.test(normalized)
      ? "level"
      : /\b(most practiced|most used)\b/.test(normalized)
        ? "practice"
        : /\b(most evidence|strongest evidence)\b/.test(normalized)
          ? "evidence"
          : null;

  const results = skills.filter(isPrimarySkillBookRecord).flatMap((skill) => {
    const profile = readSkillProfile(skill.metadata);
    const skillScopes = scopesFor(skill);
    const relatedProjects = profile?.related_projects ?? [];
    if (scopes.some((scope) => !skillScopes.includes(scope))) return [];
    if (category && normalize(skill.skill_category) !== category) return [];
    if (
      relatedProject &&
      !relatedProjects.some((project) => normalize(project).includes(normalize(relatedProject)))
    ) {
      return [];
    }
    const reasons = [
      ...scopes.map((scope) => scope.replace(/_/g, " ")),
      category ? `${category} skill` : null,
      relatedProject ? `used for ${relatedProject}` : null,
    ].filter((reason): reason is string => Boolean(reason));
    return [{
      skillId: skill.id,
      name: skill.skill_name,
      category: skill.skill_category,
      description: skill.description,
      active: skill.is_active,
      autoDetected: skill.auto_detected,
      currentLevel: skill.current_level,
      totalXp: skill.total_xp,
      practiceCount: skill.practice_count,
      confidenceScore: skill.confidence_score,
      firstMentionedAt: skill.first_mentioned_at,
      lastPracticedAt: skill.last_practiced_at,
      skillType: profile?.skill_type ?? null,
      monetization: profile?.monetization ?? null,
      proficiency: profile?.proficiency ?? null,
      enjoyment: profile?.enjoyment ?? null,
      usageFrequency: profile?.usage_frequency ?? null,
      trajectory: profile?.trajectory ?? null,
      relatedProjects,
      relatedJobs: profile?.related_jobs ?? [],
      evidenceCount: profile?.evidence?.length ?? 0,
      scopes: skillScopes,
      needsReview: skillScopes.includes("needs_review"),
      score: reasons.length * 10,
      matchedReasons: reasons.length
        ? reasons
        : [`${skill.skill_category} · level ${skill.current_level}`],
    }];
  });

  if (sort === "proficiency") {
    results.sort(
      (a, b) =>
        Number(b.evidenceCount > 0) - Number(a.evidenceCount > 0) ||
        (b.proficiency ?? -1) - (a.proficiency ?? -1),
    );
  } else if (sort === "level") results.sort((a, b) => b.currentLevel - a.currentLevel);
  else if (sort === "practice") results.sort((a, b) => b.practiceCount - a.practiceCount);
  else if (sort === "evidence") results.sort((a, b) => b.evidenceCount - a.evidenceCount);

  return {
    query,
    intent: scopes.includes("needs_review")
      ? "quality"
      : sort
        ? "ranking"
        : relatedProject
          ? "find"
          : scopes.some((scope) => ["improving", "stagnant", "declining"].includes(scope))
            ? "growth"
            : scopes.length
              ? "activity"
              : category
                ? "category"
                : query.trim()
                  ? "find"
                  : "browse",
    results,
    total: results.length,
    limit: 100,
    offset: 0,
    facets: { categories: [], skillTypes: [], monetization: [], trajectories: [], scopes: [] },
    warnings:
      sort === "proficiency" && results.some((skill) => skill.evidenceCount === 0)
        ? ["Inferred skill scores without supporting evidence are ranked after grounded scores."]
        : [],
  };
}

import type {
  RomanceQueryResponse,
  RomanceQueryResult,
  RomanceQueryScope,
} from "./api-contracts";

export type DemoRomanceSource = {
  id: string;
  person_id: string;
  person_type: "character" | "omega_entity";
  person_name?: string;
  character_id?: string | null;
  relationship_type: string;
  status: string;
  is_current: boolean;
  is_situationship: boolean;
  exclusivity_status?: string;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  strengths?: string[];
  weaknesses?: string[];
  red_flags?: string[];
  green_flags?: string[];
  start_date?: string;
  end_date?: string;
  metadata?: {
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: "low" | "moderate" | "high";
    };
  } & Record<string, unknown>;
};

const END_STATUSES = new Set(["ended", "ghosted", "blocked"]);
const CRUSH_TYPES = new Set(["crush", "obsession", "infatuation", "lust"]);
const DATING_TYPES = new Set([
  "dating",
  "boyfriend",
  "girlfriend",
  "lover",
  "in_love",
  "fiancé",
  "fiancée",
  "wife",
  "husband",
]);

function scopesFor(row: DemoRomanceSource): RomanceQueryScope[] {
  const scopes: RomanceQueryScope[] = [];
  const type = row.relationship_type.toLowerCase();
  const status = row.status.toLowerCase();
  const ended =
    !row.is_current || END_STATUSES.has(status) || type.startsWith("ex_");
  const obsession = row.metadata?.signals?.obsession_score ?? 0;
  if (!ended) scopes.push("active");
  if (ended) scopes.push("past");
  if (status === "ghosted" || status === "blocked") scopes.push("no_contact");
  if (row.is_situationship || type === "situationship")
    scopes.push("situationship");
  if (CRUSH_TYPES.has(type)) scopes.push("crush");
  if (!ended && DATING_TYPES.has(type)) scopes.push("dating");
  if (
    status === "rekindled" ||
    (ended &&
      (row.green_flags?.length ?? 0) > (row.red_flags?.length ?? 0) &&
      obsession < 0.6)
  ) {
    scopes.push("reconnection");
  }
  if (
    (row.red_flags?.length ?? 0) >= 2 ||
    row.relationship_health < 0.4 ||
    obsession >= 0.6 ||
    ["blocked", "ghosted", "complicated"].includes(status) ||
    type === "obsession"
  ) {
    scopes.push("high_risk");
  }
  if (row.metadata?.signals?.signal_strength === "low")
    scopes.push("needs_review");
  return [...new Set(scopes)];
}

export function compileDemoRomanceQuery(
  rows: DemoRomanceSource[],
  query: string,
): RomanceQueryResponse {
  const normalized = query.toLowerCase();
  const requestedScopes: RomanceQueryScope[] = [];
  if (/\b(?:current|active|right now|still dating)\b/i.test(query))
    requestedScopes.push("active");
  if (
    /\b(?:past|former|previous|exes?|used to date|have i dated|did i date)\b/i.test(
      query,
    )
  )
    requestedScopes.push("past");
  if (/\b(?:no contact|ghosted|blocked|cut off)\b/i.test(query))
    requestedScopes.push("no_contact");
  if (/\b(?:reconnect|reconnection|rekindled)\b/i.test(query))
    requestedScopes.push("reconnection");
  if (/\bsituationships?\b/i.test(query)) requestedScopes.push("situationship");
  if (
    /\b(?:crushes?|infatuations?|obsessions?|romantic interests?)\b/i.test(
      query,
    )
  )
    requestedScopes.push("crush");
  if (/\b(?:high risk|red flags?|unhealthy|toxic|fixation)\b/i.test(query))
    requestedScopes.push("high_risk");
  if (/\b(?:needs? review|weak evidence|not linked)\b/i.test(query))
    requestedScopes.push("needs_review");
  if (
    /\b(?:dating|boyfriends?|girlfriends?|partners?|lovers?)\b/i.test(query) &&
    !/\b(?:past|former|exes?)\b/i.test(query)
  ) {
    requestedScopes.push("dating");
  }
  const personMatch = query
    .match(
      /\b(?:relationship|romance|history|connection)\s+with\s+(.+?)\??$/i,
    )?.[1]
    ?.trim();
  const year = Number(query.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) || null;
  const wantsRedFlags = /\bred flags?\b/i.test(query);
  const wantsGreenFlags = /\bgreen flags?\b/i.test(query);

  const results = rows.flatMap<RomanceQueryResult>((row) => {
    if (!row.person_name) return [];
    const scopes = scopesFor(row);
    if (requestedScopes.some((scope) => !scopes.includes(scope))) return [];
    if (
      personMatch &&
      !row.person_name.toLowerCase().includes(personMatch.toLowerCase())
    )
      return [];
    if (wantsRedFlags && !row.red_flags?.length) return [];
    if (wantsGreenFlags && !row.green_flags?.length) return [];
    if (year) {
      const start = new Date(row.start_date ?? "1900-01-01").getFullYear();
      const end = row.end_date
        ? new Date(row.end_date).getFullYear()
        : row.is_current
          ? 9999
          : start;
      if (year < start || year > end) return [];
    }
    const signal = row.metadata?.signals?.signal_strength;
    const reasons = [
      personMatch && `connection with ${personMatch}`,
      ...requestedScopes.map((scope) => scope.replace(/_/g, " ")),
      year && `active during ${year}`,
      wantsRedFlags && `${row.red_flags?.length ?? 0} red flags`,
      wantsGreenFlags && `${row.green_flags?.length ?? 0} green flags`,
    ].filter((reason): reason is string => Boolean(reason));
    return [
      {
        relationshipId: row.id,
        personId: row.person_id,
        personName: row.person_name,
        characterId:
          row.character_id ??
          (row.person_type === "character" ? row.person_id : null),
        relationshipType: row.relationship_type,
        status: row.status,
        isCurrent: row.is_current,
        isSituationship: row.is_situationship,
        exclusivityStatus: row.exclusivity_status,
        startDate: row.start_date,
        endDate: row.end_date,
        affectionScore: row.affection_score,
        compatibilityScore: row.compatibility_score,
        healthScore: row.relationship_health,
        intensityScore: row.emotional_intensity,
        attachmentScore: row.metadata?.signals?.attachment_intensity,
        obsessionScore: row.metadata?.signals?.obsession_score,
        evidenceStrength:
          signal === "high"
            ? "strong"
            : signal === "moderate"
              ? "moderate"
              : signal === "low"
                ? "weak"
                : "none",
        scoresEvidenceBacked: signal !== "low",
        hasCharacterCard:
          row.person_type === "character" || Boolean(row.character_id),
        greenFlags: row.green_flags ?? [],
        redFlags: row.red_flags ?? [],
        strengths: row.strengths ?? [],
        weaknesses: row.weaknesses ?? [],
        scopes,
        needsReview: scopes.includes("needs_review"),
        score: personMatch ? 20 : requestedScopes.length * 10,
        matchedReasons: reasons.length
          ? reasons
          : [`${row.relationship_type.replace(/_/g, " ")} · ${row.status}`],
      },
    ];
  });

  if (/\b(?:highest|best|top|most)\s+compatib/i.test(normalized)) {
    results.sort(
      (a, b) => (b.compatibilityScore ?? -1) - (a.compatibilityScore ?? -1),
    );
  } else if (/\b(?:healthiest|best health)\b/i.test(normalized)) {
    results.sort((a, b) => (b.healthScore ?? -1) - (a.healthScore ?? -1));
  } else if (
    /\b(?:most affection|like most|highest affection)\b/i.test(normalized)
  ) {
    results.sort((a, b) => (b.affectionScore ?? -1) - (a.affectionScore ?? -1));
  }

  const facet = (values: string[]) =>
    [...new Set(values)].map((value) => ({
      value,
      count: values.filter((candidate) => candidate === value).length,
    }));
  return {
    query,
    intent: personMatch
      ? "person"
      : year
        ? "history"
        : requestedScopes.includes("high_risk")
          ? "risk"
          : requestedScopes.includes("needs_review")
            ? "quality"
            : /\b(?:highest|best|top|most)\b/i.test(query)
              ? "ranking"
              : "connection",
    results,
    total: results.length,
    limit: 100,
    offset: 0,
    facets: {
      relationshipTypes: facet(
        results.map((result) => result.relationshipType),
      ),
      statuses: facet(results.map((result) => result.status)),
      scopes: facet(results.flatMap((result) => result.scopes)),
      evidenceStrengths: facet(
        results.map((result) => result.evidenceStrength),
      ),
    },
    warnings: [],
  };
}

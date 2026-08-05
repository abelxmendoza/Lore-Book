import type {
  RomanceQueryRequest,
  RomanceQueryResponse,
  RomanceQueryResult,
  RomanceQueryScope,
  RomanceReciprocity,
} from "@lorebook/api-contracts";

import { logger } from "../../logger";
import {
  loadDatingEligibilityForRows,
  type DatingEligibilityResult,
} from "../conversationCentered/datingEligibilityService";
import { enrichRomanticRelationshipsForUser } from "../conversationCentered/romanticRelationshipEnrichment";
import { BOOK_QUERY_SOURCE_ROW_CAP } from "../query/bookQuerySourceCaps";
import { supabaseAdmin } from "../supabaseClient";

export type RomanceQuerySource = {
  id: string;
  person_id: string;
  person_type: "character" | "omega_entity";
  person_name?: string | null;
  character_id?: string | null;
  relationship_type: string;
  status: string;
  is_current: boolean;
  is_situationship: boolean;
  exclusivity_status?: string | null;
  affection_score?: number | null;
  emotional_intensity?: number | null;
  compatibility_score?: number | null;
  relationship_health?: number | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  red_flags?: string[] | null;
  green_flags?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  eligibility?: DatingEligibilityResult;
};

type QueryHints = {
  intent: RomanceQueryResponse["intent"];
  personNames: string[];
  scopes: RomanceQueryScope[];
  statuses: string[];
  flagTerms: string[];
  year?: number;
  textTerms: string[];
};

const END_STATUSES = new Set(["ended", "ghosted", "blocked"]);
const NO_CONTACT_STATUSES = new Set(["ghosted", "blocked"]);
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
const STOP_WORDS = new Set([
  "a",
  "all",
  "am",
  "are",
  "did",
  "do",
  "find",
  "for",
  "have",
  "i",
  "in",
  "is",
  "by",
  "connection",
  "connections",
  "list",
  "me",
  "my",
  "of",
  "record",
  "records",
  "relationship",
  "relationships",
  "romance",
  "romantic",
  "show",
  "the",
  "to",
  "was",
  "were",
  "what",
  "which",
  "who",
  "with",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function capturedPerson(query: string): string[] {
  const patterns = [
    /\b(?:relationship|romance|history|connection)\s+with\s+(.+?)\??$/i,
    /\b(?:am i dating|did i date|was i seeing|have i dated)\s+(.+?)\??$/i,
    /\b(?:show|find)\s+(?:my\s+)?(?:relationship|romance)\s+(?:with|for)\s+(.+?)\??$/i,
  ];
  for (const pattern of patterns) {
    const name = query.match(pattern)?.[1]?.trim();
    if (
      name &&
      name.length <= 160 &&
      !/^(?:in|during|before|after|when|which|who)\b/i.test(name)
    ) {
      return [name];
    }
  }
  return [];
}

export function deriveRomanceQueryHints(query: string): QueryHints {
  const personNames = capturedPerson(query);
  const scopes: RomanceQueryScope[] = [];
  const statuses: string[] = [];
  const flagTerms: string[] = [];
  let intent: QueryHints["intent"] = query.trim() ? "connection" : "browse";

  if (personNames.length) intent = "person";
  if (/\b(?:current|active|right now|still dating)\b/i.test(query))
    scopes.push("active");
  if (
    /\b(?:past|former|previous|exes?|used to date|have i dated|did i date)\b/i.test(
      query,
    )
  ) {
    scopes.push("past");
    intent = "history";
  }
  if (/\b(?:no contact|ghosted|blocked|cut off)\b/i.test(query)) {
    scopes.push("no_contact");
    intent = "status";
  }
  if (/\b(?:reconnect|reconnection|rekindled|could reconnect)\b/i.test(query)) {
    scopes.push("reconnection");
    intent = "status";
  }
  if (/\b(?:situationships?|undefined relationship)\b/i.test(query))
    scopes.push("situationship");
  if (
    /\b(?:crushes?|infatuations?|obsessions?|attracted to|romantic interests?)\b/i.test(
      query,
    )
  ) {
    scopes.push("crush");
  }
  if (/\b(?:one[- ]sided|only i like|only they like|my feelings only|their feelings only)\b/i.test(query)) {
    scopes.push("one_sided");
  }
  if (/\b(?:possible|maybe|possibly|might be) mutual(?: (?:crush|interest|attraction))?\b/i.test(query)) {
    scopes.push("possible_mutual");
  } else if (/\b(?:mutual (?:crush|interest|attraction)|like each other|both interested)\b/i.test(query)) {
    scopes.push("mutual_interest");
  }
  if (
    /\b(?:dating|boyfriends?|girlfriends?|partners?|lovers?|spouses?)\b/i.test(
      query,
    ) &&
    !personNames.length
  ) {
    scopes.push("dating");
  }
  if (
    /\b(?:high risk|red flags?|unhealthy|toxic|dangerous|fixation)\b/i.test(
      query,
    )
  ) {
    scopes.push("high_risk");
    intent = "risk";
  }
  if (
    /\b(?:needs? review|uncertain|weak evidence|not linked|missing character)\b/i.test(
      query,
    )
  ) {
    scopes.push("needs_review");
    intent = "quality";
  }

  if (/\bghosted\b/i.test(query)) statuses.push("ghosted");
  if (/\bblocked\b/i.test(query)) statuses.push("blocked");
  if (/\bunrequited\b/i.test(query)) {
    statuses.push("unrequited");
    scopes.push("one_sided");
  }
  if (/\bcomplicated\b/i.test(query)) statuses.push("complicated");
  if (/\bon break\b/i.test(query)) statuses.push("on_break");
  if (/\brekindled\b/i.test(query)) statuses.push("rekindled");
  if (/\bgreen flags?\b/i.test(query)) flagTerms.push("green");
  if (/\bred flags?\b/i.test(query)) flagTerms.push("red");
  if (/\b(?:highest|best|most|rank|ranking|top)\b/i.test(query))
    intent = "ranking";

  const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  if (year) intent = "history";

  const excluded = new Set([
    ...personNames.flatMap((name) => normalize(name).split(/\s+/)),
    ...scopes.flatMap((scope) => scope.split("_")),
    ...statuses.flatMap((status) => status.split("_")),
    ...flagTerms,
    year ? String(year) : "",
    "current",
    "currently",
    "right",
    "now",
    "still",
    "past",
    "former",
    "previous",
    "used",
    "date",
    "dated",
    "dating",
    "seeing",
    "ex",
    "exes",
    "contact",
    "cut",
    "off",
    "reconnect",
    "reconnection",
    "rekindled",
    "could",
    "undefined",
    "crush",
    "crushes",
    "infatuation",
    "infatuations",
    "obsession",
    "obsessions",
    "attracted",
    "interest",
    "interests",
    "boyfriend",
    "boyfriends",
    "girlfriend",
    "girlfriends",
    "partner",
    "partners",
    "lover",
    "lovers",
    "spouse",
    "spouses",
    "high",
    "risk",
    "flag",
    "flags",
    "unhealthy",
    "toxic",
    "dangerous",
    "fixation",
    "need",
    "needs",
    "review",
    "uncertain",
    "weak",
    "evidence",
    "not",
    "linked",
    "missing",
    "character",
    "green",
    "red",
    "highest",
    "best",
    "most",
    "rank",
    "ranking",
    "top",
    "compatibility",
    "health",
    "affection",
    "intensity",
    "attachment",
    "score",
    "scores",
    "grounded",
    "backed",
  ]);
  const textTerms = normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .filter((term) => !STOP_WORDS.has(term) && !excluded.has(term));

  return {
    intent,
    personNames,
    scopes: unique(scopes),
    statuses: unique(statuses),
    flagTerms: unique(flagTerms),
    year,
    textTerms: unique(textTerms),
  };
}

function scoreEvidenceBacked(row: RomanceQuerySource): boolean {
  const count = row.metadata?.score_evidence_count;
  return typeof count === "number" && count > 0;
}

function reciprocityFor(row: RomanceQuerySource): RomanceReciprocity {
  const value = row.metadata?.reciprocity;
  if (
    value === "user_interest_only" ||
    value === "other_interest_only" ||
    value === "possible_mutual" ||
    value === "mutual_interest"
  ) return value;
  if (normalize(row.status) === "unrequited") return "user_interest_only";
  const type = normalize(row.relationship_type).replaceAll(" ", "_");
  if (DATING_TYPES.has(type)) return "mutual_interest";
  if (CRUSH_TYPES.has(type)) return "user_interest_only";
  return "unknown";
}

function evidenceStrength(
  row: RomanceQuerySource,
): RomanceQueryResult["evidenceStrength"] {
  const value = row.eligibility?.romanticEvidenceStrength;
  if (value === "strong") return "strong";
  if (value === "weak") return "weak";
  const signal = (
    row.metadata?.signals as { signal_strength?: unknown } | undefined
  )?.signal_strength;
  if (signal === "high") return "strong";
  if (signal === "moderate") return "moderate";
  if (signal === "low") return "weak";
  return "none";
}

function scopesFor(
  row: RomanceQuerySource,
  scoresBacked: boolean,
): RomanceQueryScope[] {
  const scopes: RomanceQueryScope[] = [];
  const status = normalize(row.status).replaceAll(" ", "_");
  const type = normalize(row.relationship_type).replaceAll(" ", "_");
  const ended =
    !row.is_current || END_STATUSES.has(status) || type.startsWith("ex_");
  const signals = (row.metadata?.signals ?? {}) as {
    obsession_score?: number;
  };
  const redFlags = row.red_flags ?? [];
  const greenFlags = row.green_flags ?? [];

  if (!ended) scopes.push("active");
  if (ended) scopes.push("past");
  if (NO_CONTACT_STATUSES.has(status)) scopes.push("no_contact");
  if (row.is_situationship || type === "situationship")
    scopes.push("situationship");
  if (CRUSH_TYPES.has(type)) scopes.push("crush");
  const reciprocity = reciprocityFor(row);
  if (reciprocity === "user_interest_only" || reciprocity === "other_interest_only") {
    scopes.push("one_sided");
  }
  if (reciprocity === "possible_mutual") scopes.push("possible_mutual");
  if (reciprocity === "mutual_interest") scopes.push("mutual_interest");
  if (!ended && DATING_TYPES.has(type)) scopes.push("dating");
  if (
    status === "rekindled" ||
    (ended &&
      greenFlags.length > redFlags.length &&
      !NO_CONTACT_STATUSES.has(status) &&
      (signals.obsession_score ?? 0) < 0.6)
  ) {
    scopes.push("reconnection");
  }
  if (
    redFlags.length >= 2 ||
    (scoresBacked && (row.relationship_health ?? 1) < 0.4) ||
    (signals.obsession_score ?? 0) >= 0.6 ||
    ["blocked", "ghosted", "complicated"].includes(status) ||
    type === "obsession"
  ) {
    scopes.push("high_risk");
  }
  if (row.eligibility?.reviewRequired) scopes.push("needs_review");
  return unique(scopes);
}

function facet(
  items: RomanceQueryResult[],
  values: (item: RomanceQueryResult) => string[],
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of values(item))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function includesAll(values: string[], targets: string[]): boolean {
  return targets.every((target) =>
    values.some((value) => normalize(value).includes(normalize(target))),
  );
}

function overlapsWindow(
  row: RomanceQuerySource,
  after?: string,
  before?: string,
): boolean {
  const start =
    Date.parse(row.start_date || row.created_at || "") ||
    Number.NEGATIVE_INFINITY;
  const end =
    Date.parse(row.end_date || "") ||
    (row.is_current ? Number.POSITIVE_INFINITY : start);
  const lower = after ? Date.parse(after) : Number.NEGATIVE_INFINITY;
  const upper = before ? Date.parse(before) : Number.POSITIVE_INFINITY;
  return start <= upper && end >= lower;
}

export function compileRomanceQuery(
  rows: RomanceQuerySource[],
  request: RomanceQueryRequest,
): RomanceQueryResponse {
  const hints = deriveRomanceQueryHints(request.query);
  const filters = request.filters ?? {};
  const personNames = unique([
    ...(filters.personNames ?? []),
    ...hints.personNames,
  ]);
  const statuses = unique([...(filters.statuses ?? []), ...hints.statuses]);
  const scopes = unique([...(filters.scopes ?? []), ...hints.scopes]);
  const flagTerms = unique([...(filters.flagTerms ?? []), ...hints.flagTerms]);
  const activeOnOrAfter =
    filters.activeOnOrAfter ?? (hints.year ? `${hints.year}-01-01` : undefined);
  const activeOnOrBefore =
    filters.activeOnOrBefore ??
    (hints.year ? `${hints.year}-12-31T23:59:59Z` : undefined);
  const wantsReview = scopes.includes("needs_review");

  let results = rows.flatMap<RomanceQueryResult>((row) => {
    const personName = row.person_name?.trim();
    if (!personName) return [];
    const eligibility = row.eligibility;
    if (!wantsReview && eligibility && !eligibility.visibleInDatingBook)
      return [];
    if (wantsReview && !eligibility?.reviewRequired) return [];

    const backed = scoreEvidenceBacked(row);
    const rowScopes = scopesFor(row, backed);
    const greenFlags = row.green_flags ?? [];
    const redFlags = row.red_flags ?? [];
    const strengths = backed ? (row.strengths ?? []) : [];
    const weaknesses = backed ? (row.weaknesses ?? []) : [];
    const signals = (row.metadata?.signals ?? {}) as {
      attachment_intensity?: number;
      obsession_score?: number;
    };
    const reasons: string[] = [];
    let score = 0;

    for (const term of hints.textTerms) {
      const values = [
        personName,
        row.relationship_type,
        row.status,
        row.exclusivity_status,
        ...greenFlags,
        ...redFlags,
        ...strengths,
        ...weaknesses,
        ...(eligibility?.romanticEvidence ?? []),
      ];
      if (!values.some((value) => normalize(value).includes(term)))
        score -= 100;
      else {
        score += normalize(personName).includes(term) ? 12 : 6;
        reasons.push(`matches “${term}”`);
      }
    }
    if (personNames.length && includesAll([personName], personNames)) {
      score += 20;
      reasons.push(`connection with ${personNames.join(", ")}`);
    }
    for (const scope of scopes) {
      if (rowScopes.includes(scope)) reasons.push(scope.replaceAll("_", " "));
    }
    if (
      statuses.length &&
      statuses.some((status) => normalize(row.status) === normalize(status))
    ) {
      reasons.push(`status: ${row.status.replaceAll("_", " ")}`);
    }
    if (flagTerms.includes("red") && redFlags.length)
      reasons.push(`${redFlags.length} red flags`);
    if (flagTerms.includes("green") && greenFlags.length)
      reasons.push(`${greenFlags.length} green flags`);
    if (hints.year) reasons.push(`active during ${hints.year}`);
    if (!backed) reasons.push("scores still need evidence");
    if (!reasons.length)
      reasons.push(
        `${row.relationship_type.replaceAll("_", " ")} · ${row.status.replaceAll("_", " ")}`,
      );

    return [
      {
        relationshipId: row.id,
        personId: row.person_id,
        personName,
        characterId:
          row.character_id ??
          (row.person_type === "character" ? row.person_id : null),
        relationshipType: row.relationship_type,
        status: row.status,
        reciprocity: reciprocityFor(row),
        isCurrent: row.is_current,
        isSituationship: row.is_situationship,
        exclusivityStatus: row.exclusivity_status ?? null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        affectionScore: backed ? (row.affection_score ?? null) : null,
        compatibilityScore: backed ? (row.compatibility_score ?? null) : null,
        healthScore: backed ? (row.relationship_health ?? null) : null,
        intensityScore: backed ? (row.emotional_intensity ?? null) : null,
        attachmentScore: backed ? (signals.attachment_intensity ?? null) : null,
        obsessionScore: backed ? (signals.obsession_score ?? null) : null,
        evidenceStrength: evidenceStrength(row),
        scoresEvidenceBacked: backed,
        hasCharacterCard:
          row.person_type === "character" || Boolean(row.character_id),
        greenFlags,
        redFlags,
        strengths,
        weaknesses,
        scopes: rowScopes,
        needsReview: eligibility?.reviewRequired ?? false,
        score,
        matchedReasons: unique(reasons),
      },
    ];
  });

  if (hints.textTerms.length)
    results = results.filter((item) => item.score >= 0);
  if (filters.relationshipIds?.length)
    results = results.filter((item) =>
      filters.relationshipIds!.includes(item.relationshipId),
    );
  if (personNames.length)
    results = results.filter((item) =>
      includesAll([item.personName], personNames),
    );
  if (filters.relationshipTypes?.length)
    results = results.filter((item) =>
      filters.relationshipTypes!.some(
        (type) => normalize(type) === normalize(item.relationshipType),
      ),
    );
  if (statuses.length)
    results = results.filter((item) =>
      statuses.some((status) => normalize(status) === normalize(item.status)),
    );
  if (scopes.length)
    results = results.filter((item) =>
      scopes.every((scope) => item.scopes.includes(scope)),
    );
  if (filters.exclusivityStatuses?.length)
    results = results.filter((item) =>
      filters.exclusivityStatuses!.some(
        (status) => normalize(status) === normalize(item.exclusivityStatus),
      ),
    );
  if (filters.evidenceStrengths?.length)
    results = results.filter((item) =>
      filters.evidenceStrengths!.includes(item.evidenceStrength),
    );
  if (flagTerms.includes("red"))
    results = results.filter((item) => item.redFlags.length > 0);
  if (flagTerms.includes("green"))
    results = results.filter((item) => item.greenFlags.length > 0);
  if (filters.flagTerms?.length)
    results = results.filter((item) =>
      includesAll([...item.redFlags, ...item.greenFlags], filters.flagTerms!),
    );
  if (filters.hasCharacterCard !== undefined)
    results = results.filter(
      (item) => item.hasCharacterCard === filters.hasCharacterCard,
    );
  if (filters.scoresEvidenceBacked !== undefined)
    results = results.filter(
      (item) => item.scoresEvidenceBacked === filters.scoresEvidenceBacked,
    );
  if (filters.minAffection !== undefined)
    results = results.filter(
      (item) =>
        item.affectionScore != null &&
        item.affectionScore >= filters.minAffection!,
    );
  if (filters.minCompatibility !== undefined)
    results = results.filter(
      (item) =>
        item.compatibilityScore != null &&
        item.compatibilityScore >= filters.minCompatibility!,
    );
  if (filters.minHealth !== undefined)
    results = results.filter(
      (item) =>
        item.healthScore != null && item.healthScore >= filters.minHealth!,
    );
  if (filters.minIntensity !== undefined)
    results = results.filter(
      (item) =>
        item.intensityScore != null &&
        item.intensityScore >= filters.minIntensity!,
    );
  if (filters.minAttachment !== undefined)
    results = results.filter(
      (item) =>
        item.attachmentScore != null &&
        item.attachmentScore >= filters.minAttachment!,
    );
  if (activeOnOrAfter || activeOnOrBefore) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    results = results.filter((item) => {
      const row = byId.get(item.relationshipId);
      return row
        ? overlapsWindow(row, activeOnOrAfter, activeOnOrBefore)
        : false;
    });
  }

  const allMatches = [...results];
  const value = (score: number | null | undefined) => score ?? -1;
  const latest = (item: RomanceQueryResult) =>
    Date.parse(item.endDate || item.startDate || "") || 0;
  const inferredSort =
    request.sort !== "relevance"
      ? request.sort
      : /\bcompatib/i.test(request.query) &&
          /\b(?:rank|ranking|highest|best|top|most|by)\b/i.test(request.query)
        ? "compatibility_desc"
        : /\b(?:healthiest|best health)\b/i.test(request.query)
          ? "health_desc"
          : /\b(?:most intense|highest intensity)\b/i.test(request.query)
            ? "intensity_desc"
            : /\b(?:most attached|highest attachment)\b/i.test(request.query)
              ? "attachment_desc"
              : /\b(?:most affection|like most|highest affection)\b/i.test(
                    request.query,
                  )
                ? "affection_desc"
                : /\b(?:recent|latest)\b/i.test(request.query)
                  ? "recent"
                  : "relevance";
  if (inferredSort === "name_asc")
    results.sort((a, b) => a.personName.localeCompare(b.personName));
  else if (inferredSort === "recent")
    results.sort((a, b) => latest(b) - latest(a));
  else if (inferredSort === "affection_desc")
    results.sort((a, b) => value(b.affectionScore) - value(a.affectionScore));
  else if (inferredSort === "compatibility_desc")
    results.sort(
      (a, b) => value(b.compatibilityScore) - value(a.compatibilityScore),
    );
  else if (inferredSort === "health_desc")
    results.sort((a, b) => value(b.healthScore) - value(a.healthScore));
  else if (inferredSort === "intensity_desc")
    results.sort((a, b) => value(b.intensityScore) - value(a.intensityScore));
  else if (inferredSort === "attachment_desc")
    results.sort((a, b) => value(b.attachmentScore) - value(a.attachmentScore));
  else if (inferredSort === "evidence_desc") {
    const rank = { none: 0, weak: 1, moderate: 2, strong: 3 };
    results.sort((a, b) => rank[b.evidenceStrength] - rank[a.evidenceStrength]);
  } else
    results.sort(
      (a, b) => b.score - a.score || a.personName.localeCompare(b.personName),
    );

  return {
    query: request.query,
    intent: hints.intent,
    results: results.slice(request.offset, request.offset + request.limit),
    total: results.length,
    limit: request.limit,
    offset: request.offset,
    facets: request.includeFacets
      ? {
          relationshipTypes: facet(allMatches, (item) => [
            item.relationshipType,
          ]),
          statuses: facet(allMatches, (item) => [item.status]),
          scopes: facet(allMatches, (item) => item.scopes),
          evidenceStrengths: facet(allMatches, (item) => [
            item.evidenceStrength,
          ]),
        }
      : {
          relationshipTypes: [],
          statuses: [],
          scopes: [],
          evidenceStrengths: [],
        },
    warnings: [],
  };
}

export async function queryRomanceForUser(
  userId: string,
  request: RomanceQueryRequest,
): Promise<RomanceQueryResponse> {
  const { data, error } = await supabaseAdmin
    .from("romantic_relationships")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(BOOK_QUERY_SOURCE_ROW_CAP);
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      return compileRomanceQuery([], request);
    }
    throw error;
  }
  const enriched = await enrichRomanticRelationshipsForUser(
    userId,
    (data ?? []) as RomanceQuerySource[],
  );
  const eligibility = await loadDatingEligibilityForRows(
    userId,
    enriched as Parameters<typeof loadDatingEligibilityForRows>[1],
  );
  const rows = (enriched as RomanceQuerySource[]).map((row) => ({
    ...row,
    eligibility: eligibility.get(row.id),
  }));
  logger.debug(
    { userId, relationshipCount: rows.length },
    "Compiled Dating and Romance query source",
  );
  return compileRomanceQuery(rows, request);
}

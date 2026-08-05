import type { RomanceQueryRequest } from "@lorebook/api-contracts";
import { describe, expect, it } from "vitest";

import type { DatingEligibilityResult } from "../conversationCentered/datingEligibilityService";

import {
  compileRomanceQuery,
  deriveRomanceQueryHints,
  type RomanceQuerySource,
} from "./romanceQueryService";

function eligibility(
  overrides: Partial<DatingEligibilityResult> = {},
): DatingEligibilityResult {
  return {
    entityId: "person",
    name: "Person",
    isEligible: true,
    eligibilityReason: "eligible_explicit_romantic_evidence",
    personConfidence: 1,
    familyConflict: false,
    romanticEvidence: ["I went on a date with this person."],
    romanticEvidenceStrength: "strong",
    visibleInDatingBook: true,
    reviewRequired: false,
    ...overrides,
  };
}

function row(
  overrides: Partial<RomanceQuerySource> &
    Pick<RomanceQuerySource, "id" | "person_name">,
): RomanceQuerySource {
  return {
    person_id: `${overrides.id}-person`,
    person_type: "character",
    relationship_type: "dating",
    status: "active",
    is_current: true,
    is_situationship: false,
    affection_score: 0.7,
    emotional_intensity: 0.6,
    compatibility_score: 0.7,
    relationship_health: 0.7,
    strengths: [],
    weaknesses: [],
    red_flags: [],
    green_flags: [],
    created_at: "2025-01-01T00:00:00Z",
    metadata: {
      score_evidence_count: 3,
      signals: { attachment_intensity: 0.5 },
    },
    eligibility: eligibility(),
    ...overrides,
  };
}

function request(
  query: string,
  filters: RomanceQueryRequest["filters"] = {},
): RomanceQueryRequest {
  return {
    query,
    filters,
    sort: "relevance",
    limit: 30,
    offset: 0,
    includeFacets: true,
  };
}

const rows: RomanceQuerySource[] = [
  row({
    id: "active",
    person_name: "Marcus",
    start_date: "2025-03-01T00:00:00Z",
    compatibility_score: 0.82,
    green_flags: ["Clear communication"],
  }),
  row({
    id: "crush",
    person_name: "Jamie",
    relationship_type: "crush",
    status: "unrequited",
    compatibility_score: 0.95,
    metadata: { signals: { signal_strength: "low" } },
  }),
  row({
    id: "past",
    person_name: "Morgan",
    relationship_type: "ex_partner",
    status: "ended",
    is_current: false,
    start_date: "2023-02-01T00:00:00Z",
    end_date: "2024-06-01T00:00:00Z",
    red_flags: ["Frequent conflict", "Poor communication"],
    relationship_health: 0.25,
  }),
  row({
    id: "possible-mutual",
    person_name: "Riley",
    relationship_type: "crush",
    metadata: {
      reciprocity: "possible_mutual",
      signals: { signal_strength: "moderate" },
    },
  }),
  row({
    id: "mutual",
    person_name: "Casey",
    relationship_type: "crush",
    metadata: {
      reciprocity: "mutual_interest",
      signals: { signal_strength: "strong" },
    },
  }),
  row({
    id: "review",
    person_name: "Taylor",
    relationship_type: "talking",
    eligibility: eligibility({
      isEligible: false,
      visibleInDatingBook: false,
      reviewRequired: true,
      romanticEvidenceStrength: "weak",
      eligibilityReason: "review_conflicting_evidence",
    }),
  }),
];

describe("romanceQueryService", () => {
  it("derives scopes without treating a crush as confirmed dating", () => {
    expect(deriveRomanceQueryHints("Show my crushes")).toMatchObject({
      scopes: ["crush"],
    });
    const result = compileRomanceQuery(rows, request("Show my crushes"));
    expect(result.results.map((item) => item.personName)).toEqual(["Casey", "Jamie", "Riley"]);
    expect(result.results.every((item) => !item.scopes.includes("dating"))).toBe(true);
  });

  it("queries active dating connections and past history", () => {
    expect(
      compileRomanceQuery(
        rows,
        request("Who am I currently dating?"),
      ).results.map((item) => item.personName),
    ).toEqual(["Marcus"]);
    expect(
      compileRomanceQuery(rows, request("Who did I date in 2024?")).results.map(
        (item) => item.personName,
      ),
    ).toEqual(["Morgan"]);
  });

  it("separates one-sided, possible mutual, and confirmed mutual interest", () => {
    expect(
      compileRomanceQuery(rows, request("Show one-sided crushes")).results.map(
        (item) => item.personName,
      ),
    ).toEqual(["Jamie"]);
    expect(
      compileRomanceQuery(rows, request("Show possible mutual crushes")).results.map(
        (item) => item.personName,
      ),
    ).toEqual(["Riley"]);
    expect(
      compileRomanceQuery(rows, request("Show mutual interest")).results.map(
        (item) => item.personName,
      ),
    ).toEqual(["Casey", "Marcus"]);
  });

  it("does not expose unsupported scores or rank them above grounded scores", () => {
    const result = compileRomanceQuery(
      rows,
      request("Rank my romantic connections by compatibility"),
    );
    const crush = result.results.find((item) => item.personName === "Jamie");
    expect(crush?.scoresEvidenceBacked).toBe(false);
    expect(crush?.compatibilityScore).toBeNull();
    expect(result.results[0].personName).toBe("Marcus");
  });

  it("keeps review-only records out of normal results but makes them queryable", () => {
    expect(
      compileRomanceQuery(
        rows,
        request("Show my romantic relationships"),
      ).results.some((item) => item.personName === "Taylor"),
    ).toBe(false);
    expect(
      compileRomanceQuery(
        rows,
        request("Which romantic records need review?"),
      ).results.map((item) => item.personName),
    ).toEqual(["Taylor"]);
  });

  it("finds evidence-grounded high-risk records", () => {
    const result = compileRomanceQuery(
      rows,
      request("Which relationships have red flags?"),
    );
    expect(result.results.map((item) => item.personName)).toEqual(["Morgan"]);
    expect(
      result.facets.scopes.some((facet) => facet.value === "high_risk"),
    ).toBe(true);
  });
});

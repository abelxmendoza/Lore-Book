import { projectQueryRequestSchema } from "@lorebook/api-contracts";
import { describe, expect, it } from "vitest";

import type { ProjectRow } from "../projectService";

import { compileProjectQuery, deriveProjectQueryHints } from "./projectQueryService";

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "project-1",
    user_id: "synthetic-user",
    name: "Vanguard Robotics",
    normalized_name: "vanguard robotics",
    type: "software",
    status: "active",
    description: "Build and test the autonomous rover control system.",
    summary: null,
    tags: ["robotics", "code"],
    metadata: {},
    importance_score: 82,
    associated_character_ids: ["marcus"],
    associated_location_ids: ["lab"],
    started_at: "2026-01-10T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-01-10T00:00:00.000Z",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("projectQueryService", () => {
  it("derives grounded status, type, tag, and ranking hints", () => {
    expect(deriveProjectQueryHints('show my active software projects tagged robotics')).toMatchObject({
      scopes: ["active"],
      types: ["software"],
      tags: ["robotics"],
    });
    expect(deriveProjectQueryHints("rank my most important projects").sort).toBe("importance_desc");
  });

  it("filters projects by inferred status and explicit type", () => {
    const request = projectQueryRequestSchema.parse({
      query: "show my active projects",
      filters: { types: ["software"] },
    });
    const result = compileProjectQuery([
      project(),
      project({ id: "project-2", name: "MemoVault Launch", type: "business", status: "paused" }),
    ], request);

    expect(result.results.map((row) => row.name)).toEqual(["Vanguard Robotics"]);
    expect(result.intent).toBe("status");
  });

  it("supports project history by year and completion state", () => {
    const request = projectQueryRequestSchema.parse({
      query: "which projects were completed in 2025?",
    });
    const result = compileProjectQuery([
      project({
        id: "project-2025",
        name: "MemoVault Prototype",
        status: "completed",
        started_at: "2025-02-01T00:00:00.000Z",
        ended_at: "2025-09-01T00:00:00.000Z",
      }),
      project(),
    ], request);

    expect(result.results.map((row) => row.name)).toEqual(["MemoVault Prototype"]);
    expect(result.results[0].scopes).toContain("completed");
  });

  it("ranks missing importance last and reports the limitation", () => {
    const request = projectQueryRequestSchema.parse({
      query: "show my most important projects",
    });
    const result = compileProjectQuery([
      project({ id: "grounded", importance_score: 82 }),
      project({ id: "unknown", name: "Unscored Build", importance_score: null }),
    ], request);

    expect(result.results[0].projectId).toBe("grounded");
    expect(result.warnings).toContain("Projects without a grounded importance score are ranked last.");
  });

  it("surfaces fallback and incomplete records as needing review", () => {
    const request = projectQueryRequestSchema.parse({
      query: "which projects need review?",
    });
    const result = compileProjectQuery([
      project({
        id: "fallback",
        name: "Vanguard Community",
        description: null,
        metadata: { source: "organizations_fallback" },
      }),
      project(),
    ], request);

    expect(result.results.map((row) => row.projectId)).toEqual(["fallback"]);
    expect(result.results[0].needsReview).toBe(true);
  });
});

import { questQueryRequestSchema } from "@lorebook/api-contracts";
import { describe, expect, it } from "vitest";

import { compileQuestQuery, deriveQuestQueryHints } from "./questQueryService";
import type { Quest } from "./types";

const rows: Quest[] = [
  {
    id: "q-active",
    title: "Ship MemoVault onboarding",
    description: "Finish and verify the first-run experience",
    quest_type: "main",
    priority: 9,
    importance: 9,
    impact: 8,
    status: "active",
    progress_percentage: 60,
    category: "product",
    tags: ["MemoVault", "release"],
    source: "manual",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-26T00:00:00.000Z",
    last_activity_at: "2026-07-26T00:00:00.000Z",
  },
  {
    id: "q-done",
    title: "Test Vanguard Robotics demo",
    description: "Run the synthetic demo suite",
    quest_type: "side",
    priority: 5,
    importance: 6,
    impact: 5,
    status: "completed",
    progress_percentage: 100,
    category: "career",
    tags: ["testing"],
    source: "manual",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
  },
];

describe("questQueryService", () => {
  it("recognizes current-work and priority intent", () => {
    expect(deriveQuestQueryHints("What quests am I currently working on?").scopes).toContain("active");
    expect(deriveQuestQueryHints("Rank my quests by highest priority").sort).toBe("priority_desc");
  });

  it("filters grounded active quests and explains the match", () => {
    const request = questQueryRequestSchema.parse({ query: "What quests am I currently working on?" });
    const result = compileQuestQuery(rows, request);
    expect(result.total).toBe(1);
    expect(result.results[0].questId).toBe("q-active");
    expect(result.results[0].matchedReasons).toContain("active quest");
  });

  it("supports structured progress and tag filters", () => {
    const request = questQueryRequestSchema.parse({
      query: "",
      filters: { tags: ["release"], minProgress: 50, maxProgress: 90 },
    });
    expect(compileQuestQuery(rows, request).results.map((row) => row.questId)).toEqual(["q-active"]);
  });

  it("treats mutually exclusive status words as alternatives", () => {
    const request = questQueryRequestSchema.parse({ query: "Show my active or completed quests" });
    expect(compileQuestQuery(rows, request).total).toBe(2);
  });

  it("does not invent blocked state without explicit metadata", () => {
    const request = questQueryRequestSchema.parse({ query: "Show my blocked quests" });
    const result = compileQuestQuery(rows, request);
    expect(result.results).toEqual([]);
    expect(result.warnings[0]).toMatch(/explicitly marked blocked/i);
  });
});

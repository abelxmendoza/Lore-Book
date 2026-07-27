import { skillQueryRequestSchema } from "@lorebook/api-contracts";
import { describe, expect, it } from "vitest";

import { compileSkillQuery, deriveSkillQueryHints } from "./skillQueryService";
import type { Skill } from "./skillService";

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    user_id: "synthetic-user",
    skill_name: "Robotics",
    skill_category: "technical",
    current_level: 8,
    total_xp: 2400,
    xp_to_next_level: 300,
    description: "Building and programming autonomous machines.",
    first_mentioned_at: "2025-01-01T00:00:00.000Z",
    last_practiced_at: new Date().toISOString(),
    practice_count: 64,
    auto_detected: false,
    confidence_score: 0.94,
    is_active: true,
    metadata: {
      skill_profile: {
        skill_type: "technical",
        monetization: "potentially_paid",
        proficiency: 86,
        enjoyment: 92,
        usage_frequency: "weekly",
        trajectory: "improving",
        related_projects: ["Vanguard Robotics"],
        related_jobs: ["Robotics Engineer"],
        evidence: [{ text: "Built an autonomous rover", confidence: 0.95 }],
      },
    },
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("skillQueryService", () => {
  it("derives work, growth, category, and ranking hints", () => {
    expect(deriveSkillQueryHints("show my paid improving technical skills")).toMatchObject({
      scopes: ["paid", "improving"],
      categories: ["technical"],
    });
    expect(deriveSkillQueryHints("what are my strongest skills by proficiency?").sort).toBe(
      "proficiency_desc",
    );
  });

  it("finds skills connected to a project", () => {
    const request = skillQueryRequestSchema.parse({
      query: "which skills are used for Vanguard Robotics?",
    });
    const result = compileSkillQuery([
      skill(),
      skill({
        id: "skill-writing",
        skill_name: "Writing",
        skill_category: "creative",
        metadata: {
          skill_profile: {
            skill_type: "creative",
            monetization: "hobby_only",
            proficiency: 70,
            enjoyment: 80,
            usage_frequency: "monthly",
            trajectory: "stable",
            related_projects: ["MemoVault"],
            evidence: [{ text: "Drafted project copy" }],
          },
        },
      }),
    ], request);

    expect(result.results.map((row) => row.name)).toEqual(["Robotics"]);
    expect(result.intent).toBe("find");
  });

  it("filters paid and improving skills", () => {
    const request = skillQueryRequestSchema.parse({
      query: "show my paid improving skills",
    });
    const result = compileSkillQuery([
      skill(),
      skill({
        id: "skill-hobby",
        skill_name: "Sketching",
        skill_category: "artistic",
        metadata: {
          skill_profile: {
            skill_type: "hobby",
            monetization: "hobby_only",
            proficiency: 60,
            enjoyment: 85,
            usage_frequency: "monthly",
            trajectory: "stagnant",
            evidence: [{ text: "Sketchbook practice" }],
          },
        },
      }),
    ], request);

    expect(result.results.map((row) => row.name)).toEqual(["Robotics"]);
  });

  it("keeps evidence-backed proficiency ahead of unsupported inferred scores", () => {
    const request = skillQueryRequestSchema.parse({
      query: "show my strongest skills by proficiency",
    });
    const result = compileSkillQuery([
      skill({ id: "grounded" }),
      skill({
        id: "unsupported",
        skill_name: "Unsupported Skill",
        metadata: {
          skill_profile: {
            skill_type: "technical",
            monetization: "unpaid",
            proficiency: 99,
            enjoyment: 50,
            usage_frequency: "rarely",
            trajectory: "unknown",
            evidence: [],
          },
        },
      }),
    ], request);

    expect(result.results[0].skillId).toBe("grounded");
    expect(result.warnings[0]).toMatch(/without supporting evidence/i);
  });

  it("excludes demoted project rows from the Skills Book query", () => {
    const request = skillQueryRequestSchema.parse({ query: "show all skills" });
    const result = compileSkillQuery([
      skill(),
      skill({
        id: "demoted",
        skill_name: "MemoVault Launch",
        metadata: { capability_entity_type: "PROJECT", skill_book_visible: false },
      }),
    ], request);

    expect(result.results.map((row) => row.skillId)).toEqual(["skill-1"]);
  });
});

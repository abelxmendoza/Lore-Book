import { describe, expect, it } from "vitest";

import type { ProjectCardData } from "../components/projects/ProjectProfileCard";
import { skillBookDemoSkills } from "../mocks/skillBookDemo";

import { compileDemoProjectQuery } from "./projectQueryDemo";
import { compileDemoSkillQuery } from "./skillQueryDemo";

const projects: ProjectCardData[] = [
  {
    id: "vanguard",
    name: "Vanguard Robotics",
    type: "software",
    status: "active",
    description: "Autonomous rover platform",
    tags: ["robotics"],
    importance_score: 90,
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: new Date().toISOString(),
  },
  {
    id: "memovault",
    name: "MemoVault Prototype",
    type: "creative",
    status: "completed",
    description: "Memory prototype",
    tags: ["memory"],
    importance_score: null,
    started_at: "2025-01-01T00:00:00.000Z",
    ended_at: "2025-08-01T00:00:00.000Z",
    updated_at: "2025-08-01T00:00:00.000Z",
  },
];

describe("Projects and Skills demo queries", () => {
  it("filters demo projects by status and year", () => {
    const result = compileDemoProjectQuery(projects, "which projects were completed in 2025?");
    expect(result.results.map((project) => project.projectId)).toEqual(["memovault"]);
  });

  it("queries the complete Skills Book demo dataset locally", () => {
    const result = compileDemoSkillQuery(
      skillBookDemoSkills,
      "show my improving technical skills",
    );
    expect(result.total).toBeGreaterThan(0);
    expect(result.results.every((skill) => skill.category === "technical")).toBe(true);
  });

  it("finds demo skills linked to a named project", () => {
    const result = compileDemoSkillQuery(
      skillBookDemoSkills,
      "which skills do I use for Omega-1?",
    );
    expect(result.results.some((skill) => skill.name === "ROS 2")).toBe(true);
  });
});

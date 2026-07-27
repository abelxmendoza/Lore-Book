import { describe, expect, it } from "vitest";

import { getMockRomanticRelationships } from "../mocks/romanticRelationships";

import { compileDemoRomanceQuery } from "./romanceQueryDemo";

describe("Dating and Romance demo query", () => {
  it("queries the complete demo dataset without calling the API", () => {
    const rows = getMockRomanticRelationships();
    expect(
      compileDemoRomanceQuery(rows, "show my past relationships").total,
    ).toBeGreaterThan(0);
    expect(
      compileDemoRomanceQuery(rows, "show my crushes").results.every((item) =>
        item.scopes.includes("crush"),
      ),
    ).toBe(true);
    expect(
      compileDemoRomanceQuery(
        rows,
        "which relationships have red flags?",
      ).results.every((item) => item.redFlags.length > 0),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { inferTasks } from "./taskInferenceService";
import { questLogInferenceService } from "./questLogInferenceService";

describe("taskInferenceService current work", () => {
  it("extracts an active task from currently-working language", () => {
    const items = inferTasks("I'm currently working on finishing the MemoVault onboarding.");
    expect(items).toHaveLength(1);
    expect(items[0].displayName).toBe("Work on finishing the MemoVault onboarding");
    expect(items[0].context.statusHint).toBe("active");
    expect(items[0].evidencePhrases[0]).toMatch(/currently working on/i);
  });

  it("does not extract a bare working-on fragment", () => {
    expect(inferTasks("I'm working on it.")).toEqual([]);
  });

  it("keeps current work as a reviewable Quest Log candidate with provenance", () => {
    const result = questLogInferenceService.inferFromMessage({
      text: "I'm currently working on finishing the MemoVault onboarding.",
      sourceMessageId: "message-1",
      authorRole: "user",
    });
    expect(result.accepted).toEqual([
      expect.objectContaining({
        displayName: "Work on finishing the MemoVault onboarding",
        itemType: "task",
        sourceMessageIds: ["message-1"],
        promotionStatus: "suggested_quest_log_item",
      }),
    ]);
  });
});

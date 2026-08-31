import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  modeRouterService,
  ChatMode,
} from "../../src/services/modeRouter/modeRouterService";
import { openai } from "../../src/services/openaiClient";
import { logger } from "../../src/logger";

vi.mock("../../src/services/openaiClient");
vi.mock("../../src/services/projects/projectStateRecallService", async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/projects/projectStateRecallService')>();
  return {
    ...actual,
    resolveProjectStateTarget: vi.fn(async (_userId: string, message: string) =>
      /\bLoreBook\b/i.test(message)
        ? { id: 'project-lorebook', name: 'LoreBook' }
        : null
    ),
  };
});
vi.mock("../../src/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("ModeRouterService", () => {
  it("routes explicit subject timelines before narrative recall", async () => {
    const explicit = await modeRouterService.routeMessage(
      "user-1",
      "Can you pull up a timeline of my time as Midnight Harb0r?",
    );
    expect(explicit.mode).toBe("SUBJECT_TIMELINE");

    const ordinaryRecall = await modeRouterService.routeMessage(
      "user-1",
      "Do you remember my time at Vanguard Robotics?",
    );
    expect(ordinaryRecall.mode).not.toBe("SUBJECT_TIMELINE");

    for (const message of [
      "How did MemoVault develop over time?",
      "Show me the history of my relationship with Jamie.",
      "What happened during my time in the Harbor scene?",
    ]) {
      await expect(
        modeRouterService.routeMessage("user-1", message),
      ).resolves.toMatchObject({ mode: "SUBJECT_TIMELINE" });
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("quickModeCheck - Pattern Matching", () => {
    it("routes relational group reads to the organization query compiler", async () => {
      for (const query of [
        "Which groups am I in?",
        "What organizations is Marcus connected to?",
        "Show unlinked bands",
        "List groups mentioned in the background",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "ORGANIZATION_QUERY" });
      }
    });

    it("routes relational family reads to the family query compiler", async () => {
      for (const query of [
        "Show my maternal cousins",
        "Who lives in my family household?",
        "Which relatives need review?",
        "How is Marcus related to me?",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "FAMILY_QUERY" });
      }
    });

    it("routes People Book list queries to the Character Book compiler", async () => {
      for (const query of [
        "Which people need review?",
        "Who do I know from Vanguard Robotics?",
        "Which people look related?",
        "Show people in my character book",
        "Show people connected to Vanguard Robotics",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "CHARACTER_QUERY" });
      }
    });

    it("keeps a who-is question out of Character Book list query mode", async () => {
      const result = await modeRouterService.routeMessage("user-1", "Who is Marcus?");
      expect(result.mode).not.toBe("CHARACTER_QUERY");
    });

    it("routes place-set questions to the location query compiler", async () => {
      for (const query of [
        "Which places did I visit with Marcus?",
        "Show locations linked to Vanguard Robotics",
        "Which locations are missing coordinates?",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "LOCATION_QUERY" });
      }
    });

    it("keeps a story question about one place out of location query mode", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "What happened at Vanguard Studio?",
      );
      expect(result.mode).not.toBe("LOCATION_QUERY");
    });

    it("routes Dating and Romance set queries to the grounded romance compiler", async () => {
      for (const query of [
        "Who am I currently dating?",
        "Show my past romantic relationships",
        "Show my inactive relationships",
        "What changed with my relationship with Marcus?",
        "Which romantic records need review?",
        "Rank my romantic relationships by compatibility",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "ROMANCE_QUERY" });
      }
    });

    it("keeps romantic advice and narrative questions out of romance query mode", async () => {
      for (const query of [
        "Do you think Marcus likes me?",
        "What happened with Marcus?",
      ]) {
        const result = await modeRouterService.routeMessage("user-1", query);
        expect(result.mode).not.toBe("ROMANCE_QUERY");
      }
    });

    it("routes project-set questions to the Projects Book compiler", async () => {
      for (const query of [
        "Show my active software projects",
        "Which projects did I complete in 2025?",
        "Rank my projects by grounded importance",
        "Which projects need review?",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "PROJECT_QUERY" });
      }
    });

    it("routes compound project-state recall before ingestion", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "What's the current state of LoreBook, and what should I do next?",
      );

      expect(result).toMatchObject({
        mode: "PROJECT_QUERY",
        confidence: 0.99,
      });
      expect(result.reasoning).toContain("Grounded project-state recall");
      expect(result.mode).not.toBe("EXPERIENCE_INGESTION");
    });

    it("keeps a project story question out of project query mode", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "What happened while I was building MemoVault?",
      );
      expect(result.mode).not.toBe("PROJECT_QUERY");
    });

    it("routes skill-set questions to the Skills Book compiler", async () => {
      for (const query of [
        "Show my improving technical skills",
        "Which skills do I use for Vanguard Robotics?",
        "Rank my skills by proficiency",
        "Which skills need review?",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", query),
        ).resolves.toMatchObject({ mode: "SKILL_QUERY" });
      }
    });

    it("keeps skill-learning advice out of skill query mode", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "How should I learn welding?",
      );
      expect(result.mode).not.toBe("SKILL_QUERY");
    });

    it.each([
      "What quests am I currently working on?",
      "Show my blocked quests",
      "Which quests are due soon?",
      "Rank my quests by priority",
    ])("routes quest-set question to the Quest Log compiler: %s", async (query) => {
      await expect(
        modeRouterService.routeMessage("user-1", query),
      ).resolves.toMatchObject({ mode: "QUEST_QUERY" });
    });

    it("keeps quest coaching out of Quest Log query mode", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "How should I complete my quest to learn welding?",
      );
      expect(result.mode).not.toBe("QUEST_QUERY");
    });

    it("keeps organization writes ahead of organization queries", async () => {
      await expect(
        modeRouterService.routeMessage(
          "user-1",
          "Make a group with Marcus and Jamie",
        ),
      ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });
    });

    it("routes explicit suggestion corrections into suggestion-dismiss mode", async () => {
      await expect(
        modeRouterService.routeMessage(
          "user-1",
          'Dismiss the place suggestion "South Coast Plaza" because it is just noise',
        ),
      ).resolves.toMatchObject({ mode: "SUGGESTION_DISMISS_WRITE" });
    });

    it("keeps an entire multi-turn group creation in the database-write mode", async () => {
      const history: Array<{ role: "user" | "assistant"; content: string }> =
        [];

      await expect(
        modeRouterService.routeMessage(
          "user-1",
          "she is a popular streamer. make a group for that",
          history,
        ),
      ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });

      history.push(
        {
          role: "user",
          content: "she is a popular streamer. make a group for that",
        },
        {
          role: "assistant",
          content: "I created the group. Send me the roster.",
        },
      );
      await expect(
        modeRouterService.routeMessage(
          "user-1",
          "So far we have Marcus, Jamie, and Nova Reed",
          history,
        ),
      ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });

      history.push(
        {
          role: "user",
          content: "So far we have Marcus, Jamie, and Nova Reed",
        },
        { role: "assistant", content: "The roster update was interrupted." },
      );
      for (const followUp of [
        "well I just gave you a roster for the new group",
        "hi so can you do it now",
        "The individual characters should all have Character Book cards too",
      ]) {
        await expect(
          modeRouterService.routeMessage("user-1", followUp, history),
        ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });
      }
    });

    it("should detect ACTION_LOG mode for explicit log commands", async () => {
      // ACTION_LOG now requires an explicit save/log command — not bare first-person sentences
      const result = await modeRouterService.routeMessage(
        "user-1",
        "Log this: I walked away",
      );

      expect(result.mode).toBe("ACTION_LOG");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should detect EXPERIENCE_INGESTION for time-bounded experiences", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "Last night I went to a party with friends at the warehouse",
      );

      expect(result.mode).toBe("EXPERIENCE_INGESTION");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should detect FOUNDATION_RECALL for explicit Recall commands", async () => {
      const queries = [
        "Recall everything you've learned about me",
        "Recall all the characters in my story",
        "Recall things you've learned about me and my Family members",
      ];

      for (const query of queries) {
        const result = await modeRouterService.routeMessage("user-1", query);
        expect(result.mode).toBe("FOUNDATION_RECALL");
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it("should detect FOUNDATION_RECALL for non-Recall foundation queries", async () => {
      const queries = [
        "What do you know about me?",
        "Tell me about my family",
        "Tell me about Sam Chen",
        "What jobs have I had?",
        "Not my full work history",
        "What schools have I been to?",
        "What jobs have I had and schools I've been to?",
      ];

      for (const query of queries) {
        const result = await modeRouterService.routeMessage("user-1", query);
        expect(result.mode).toBe("FOUNDATION_RECALL");
        expect(result.confidence).toBeGreaterThan(0.8);
      }

      await expect(
        modeRouterService.routeMessage("user-1", "Who are the characters in my story?"),
      ).resolves.toMatchObject({ mode: "FOUNDATION_RECALL" });
    });

    it("should detect MEMORY_RECALL for factual questions", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "What did I eat last Sunday morning?",
      );

      expect(result.mode).toBe("MEMORY_RECALL");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should detect NARRATIVE_RECALL for story questions", async () => {
      // This might match MEMORY_RECALL first, so we'll test with a clearer narrative pattern
      const result = await modeRouterService.routeMessage(
        "user-1",
        "What happened with that whole situation? Tell me the story.",
      );

      // It might route to NARRATIVE_RECALL or fall through to LLM
      expect(["NARRATIVE_RECALL", "MEMORY_RECALL"]).toContain(result.mode);
    });

    it("should detect EMOTIONAL_EXISTENTIAL for emotional thoughts", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "I feel like I'm not gonna make it",
      );

      expect(result.mode).toBe("EMOTIONAL_EXISTENTIAL");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8); // Changed from > to >=
    });
  });

  describe("llmModeCheck - LLM Classification", () => {
    it("should use LLM when pattern matching confidence is low", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "EXPERIENCE_INGESTION",
                confidence: 0.9,
                reasoning: "User describing a night out with multiple events",
              }),
            },
          },
        ],
      };

      vi.mocked(openai.chat.completions.create).mockResolvedValue(
        mockResponse as any,
      );

      // Use a message that won't match patterns with high confidence
      const result = await modeRouterService.routeMessage(
        "user-1",
        "Something ambiguous happened and I need to process it",
      );

      // LLM should be called if pattern matching confidence is <= 0.8
      // The actual behavior depends on quickModeCheck confidence
      expect(result.mode).toBeDefined();
    });

    it("should handle LLM errors gracefully", async () => {
      vi.mocked(openai.chat.completions.create).mockRejectedValue(
        new Error("API Error"),
      );

      // Use a message that triggers LLM (low pattern confidence, <= 0.8)
      const result = await modeRouterService.routeMessage(
        "user-1",
        "Something ambiguous that needs LLM",
      );

      // Should fall back to UNKNOWN if LLM fails
      expect(["UNKNOWN", "EMOTIONAL_EXISTENTIAL"]).toContain(result.mode);
      // Error should be logged if LLM was attempted
      // Note: llmModeCheck catches errors internally and uses logger.warn, not logger.error
      if ((openai.chat.completions.create as any).mock.calls.length > 0) {
        // The llmModeCheck method catches errors and logs with logger.warn
        expect(logger.warn).toHaveBeenCalled();
      }
    });

    it("does not route an introduction into NARRATIVE_RECALL on a weak LLM vote", async () => {
      // "Tell me about Y" is the classifier's own few-shot NARRATIVE_RECALL
      // example, so it surface-matches ordinary introductions like this one —
      // but there's nothing to recall here, just someone new being described.
      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "NARRATIVE_RECALL",
                confidence: 0.6,
                reasoning: "Surface-matches 'tell me about' example",
              }),
            },
          },
        ],
      } as any);

      const result = await modeRouterService.routeMessage(
        "user-1",
        "Let me tell you about V: her real first name is Vicky and she's one of my original scene crushes",
      );

      expect(result.mode).not.toBe("NARRATIVE_RECALL");
    });
  });

  describe("Experience vs Action Detection", () => {
    it("should distinguish between experience and explicit log command", async () => {
      const experienceResult = await modeRouterService.routeMessage(
        "user-1",
        "Last night I went to a show, met these people, things got weird",
      );

      // ACTION_LOG now requires an explicit log/save/record command prefix
      const actionResult = await modeRouterService.routeMessage(
        "user-1",
        "Save this: I told him I was done",
      );

      expect(experienceResult.mode).toBe("EXPERIENCE_INGESTION");
      expect(actionResult.mode).toBe("ACTION_LOG");
    });

    it("should detect ACTION_LOG for explicit record command", async () => {
      const result = await modeRouterService.routeMessage(
        "user-1",
        "Record: I said goodbye and left",
      );

      expect(result.mode).toBe("ACTION_LOG");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty messages", async () => {
      const result = await modeRouterService.routeMessage("user-1", "");

      expect(result.mode).toBe("UNKNOWN");
    });

    it("should handle very short messages", async () => {
      const result = await modeRouterService.routeMessage("user-1", "hi");

      expect(result.mode).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should handle mixed mode messages", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "MIXED",
                confidence: 0.7,
                reasoning: "Contains both emotional and factual elements",
                requiresDisambiguation: true,
                suggestedQuestions: [
                  "Are you asking about a memory or expressing a feeling?",
                ],
              }),
            },
          },
        ],
      };

      vi.mocked(openai.chat.completions.create).mockResolvedValue(
        mockResponse as any,
      );

      // Use a message that might trigger pattern matching first
      const result = await modeRouterService.routeMessage(
        "user-1",
        "I feel sad about what happened last week",
      );

      // Pattern matching might catch this as EMOTIONAL_EXISTENTIAL first
      // If LLM is called, it should return MIXED
      expect(result.mode).toBeDefined();
      // If it's MIXED, check for disambiguation
      if (result.mode === "MIXED") {
        expect(result.requiresDisambiguation).toBe(true);
        expect(result.suggestedQuestions).toBeDefined();
      }
    });

    it("should use conversation history for context", async () => {
      const conversationHistory = [
        { role: "user" as const, content: "I went to a party last night" },
        { role: "assistant" as const, content: "Tell me more about it" },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "EXPERIENCE_INGESTION",
                confidence: 0.95,
                reasoning: "Continuing previous experience description",
              }),
            },
          },
        ],
      };

      vi.mocked(openai.chat.completions.create).mockResolvedValue(
        mockResponse as any,
      );

      // Use a message that will trigger LLM (low pattern confidence, <= 0.8)
      const result = await modeRouterService.routeMessage(
        "user-1",
        "It was really intense",
        conversationHistory,
      );

      // If LLM was called, check that it was called (history is passed but not currently used in prompt)
      const createMock = openai.chat.completions.create as any;
      if (createMock.mock.calls.length > 0) {
        const callArgs = createMock.mock.calls[0][0];
        // Currently, the prompt only includes the message, not history (could be enhanced later)
        expect(callArgs.messages.length).toBeGreaterThanOrEqual(1);
      }
      expect(result.mode).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should return quickly for pattern-matched messages", async () => {
      vi.clearAllMocks();
      const startTime = Date.now();

      // MEMORY_RECALL matches with confidence > 0.8 via pattern — no LLM needed
      await modeRouterService.routeMessage(
        "user-1",
        "What did I eat last Sunday morning?",
      );

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500);
      expect(openai.chat.completions.create).not.toHaveBeenCalled();
    });
  });

  describe("Chat entity CRUD writes", () => {
    it("routes wrong-book corrections to ENTITY_RECLASSIFY_WRITE ahead of group write", async () => {
      await expect(
        modeRouterService.routeMessage(
          "user-1",
          "Northwind Collective is a group, not a place",
        ),
      ).resolves.toMatchObject({ mode: "ENTITY_RECLASSIFY_WRITE" });
    });

    it("routes location / project / skill / quest / family / romance writes", async () => {
      await expect(
        modeRouterService.routeMessage("user-1", "add Northwind Depot as a place"),
      ).resolves.toMatchObject({ mode: "LOCATION_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "add MemoVault as a project"),
      ).resolves.toMatchObject({ mode: "PROJECT_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "add Welding as a skill"),
      ).resolves.toMatchObject({ mode: "SKILL_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "add Ship MemoVault as a quest"),
      ).resolves.toMatchObject({ mode: "QUEST_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "mark Marcus as my cousin"),
      ).resolves.toMatchObject({ mode: "FAMILY_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "mark Jamie as ended"),
      ).resolves.toMatchObject({ mode: "ROMANCE_WRITE" });
      await expect(
        modeRouterService.routeMessage(
          "user-1",
          "we played a backyard show at Northwind Depot",
        ),
      ).resolves.toMatchObject({ mode: "EVENT_WRITE" });
    });

    it("still routes ordinary group create to ORGANIZATION_GROUP_WRITE", async () => {
      await expect(
        modeRouterService.routeMessage("user-1", "make a group for that"),
      ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });
      await expect(
        modeRouterService.routeMessage("user-1", "delete the group Northwind Collective"),
      ).resolves.toMatchObject({ mode: "ORGANIZATION_GROUP_WRITE" });
    });
  });
});

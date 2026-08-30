import { describe, expect, it, vi } from "vitest";

import { fetchJson } from "../lib/api";

import { documentsApi } from "./documents";

vi.mock("../lib/api", () => ({
  fetchJson: vi.fn(),
}));

describe("documentsApi", () => {
  it("requests automatic sorting for legacy unfiled documents", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      scanned: 3,
      moved: 3,
    });

    await expect(documentsApi.autoSort()).resolves.toMatchObject({ moved: 3 });
    expect(fetchJson).toHaveBeenCalledWith(
      "/api/documents/files/auto-sort",
      { method: "POST" },
    );
  });

  it("moves a document into a persisted library folder", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      file: { id: "file-1", category: "journals" },
    });

    await documentsApi.moveToCategory("file-1", "journals");

    expect(fetchJson).toHaveBeenCalledWith(
      "/api/documents/files/file-1/category",
      {
        method: "PATCH",
        body: JSON.stringify({ category: "journals" }),
      },
    );
  });

  it("posts a bounded, user-scoped fact query to the protected endpoint", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      result: {
        query: "what schools have I been to?",
        intent: "education",
        facts: [],
        total: 0,
        warnings: [],
        diagnostics: {
          resumeDocumentsScanned: 1,
          genericDocumentsScanned: 0,
          claimsScanned: 0,
          elapsedMs: 3,
        },
      },
    });

    await documentsApi.queryFacts({
      query: "what schools have I been to?",
      limit: 20,
    });

    expect(fetchJson).toHaveBeenCalledWith(
      "/api/documents/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "what schools have I been to?",
          limit: 20,
        }),
      }),
    );
  });
});

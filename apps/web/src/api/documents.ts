import { fetchJson } from "../lib/api";
import type { DocumentCategory } from "../lib/documentCategories";

export type DocumentFact = {
  kind: string;
  value: string;
  fieldPath: string;
  documentId: string;
  fileId: string | null;
  filename: string;
  sourceTable: string;
  sourceId: string;
  excerpt: string | null;
  confidence: number | null;
  reviewState: string;
  observedAt: string | null;
  score: number;
};

export type DocumentFactQueryResult = {
  query: string;
  intent: string;
  facts: DocumentFact[];
  total: number;
  warnings: string[];
  diagnostics: {
    resumeDocumentsScanned: number;
    genericDocumentsScanned: number;
    claimsScanned: number;
    elapsedMs: number;
  };
};

export const documentsApi = {
  async autoSort(): Promise<{ scanned: number; moved: number }> {
    return fetchJson<{ success: boolean; scanned: number; moved: number }>(
      "/api/documents/files/auto-sort",
      { method: "POST" },
    );
  },

  async getCategoryCounts(): Promise<{
    total: number;
    counts: Record<DocumentCategory, number>;
  }> {
    const response = await fetchJson<{
      success: boolean;
      total: number;
      counts: Record<DocumentCategory, number>;
    }>("/api/documents/files/categories");
    return { total: response.total, counts: response.counts };
  },

  async moveToCategory(
    fileId: string,
    category: DocumentCategory,
  ): Promise<void> {
    await fetchJson(`/api/documents/files/${fileId}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    });
  },

  async queryFacts(input: {
    query: string;
    documentId?: string;
    includePending?: boolean;
    includeEvidence?: boolean;
    limit?: number;
  }): Promise<DocumentFactQueryResult> {
    const response = await fetchJson<{
      success: boolean;
      result: DocumentFactQueryResult;
    }>("/api/documents/query", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.result;
  },
};

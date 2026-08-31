import { fetchJson } from "../lib/api";
import type { PhotoEntry } from "../services/mockDataService";

export type PhotoQueryResult = {
  query: string;
  photos: PhotoEntry[];
  total: number;
  warnings: string[];
};

export const photosApi = {
  async query(input: { query: string; limit?: number }): Promise<PhotoQueryResult> {
    const response = await fetchJson<{
      success: boolean;
      result: PhotoQueryResult;
    }>("/api/photos/query", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.result;
  },
};

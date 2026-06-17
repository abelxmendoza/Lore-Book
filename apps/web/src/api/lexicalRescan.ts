import { fetchJson } from '../lib/api';

export type KeywordRescanHit = {
  keyword: string;
  source: 'chat' | 'journal';
  sourceId: string;
  sessionId?: string;
  role?: string;
  excerpt: string;
  discoveredEntities: Array<{
    surface: string;
    name: string;
    domain: string;
    category: string;
    subcategory?: string;
    confidence: number;
    reason: string;
  }>;
  glossaryMatches: Array<{
    term: string;
    category: string;
    subcategory?: string;
    confidence: number;
  }>;
};

export type KeywordRescanSummary = {
  keywords: string[];
  scannedMessages: number;
  scannedJournals: number;
  hitCount: number;
  hits: KeywordRescanHit[];
  personsDiscovered: number;
  charactersPromoted: number;
  charactersSkipped: number;
  restoredFromEvidence: number;
};

export const lexicalRescanApi = {
  scan: (keywords: string[], opts?: { promote?: boolean; limit?: number }) =>
    fetchJson<{ success: boolean; summary: KeywordRescanSummary }>('/api/conversation/lexical-rescan', {
      method: 'POST',
      body: JSON.stringify({
        keywords,
        promote: opts?.promote ?? true,
        limit: opts?.limit,
      }),
    }),
};

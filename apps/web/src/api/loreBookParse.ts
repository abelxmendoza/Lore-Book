import { fetchJson } from '../lib/api';

export type LoreBookParseDomain =
  | 'characters'
  | 'locations'
  | 'skills'
  | 'projects'
  | 'quests'
  | 'organizations'
  | 'groups'
  | 'relationships'
  | 'timeline'
  | 'events'
  | 'family'
  | 'schools'
  | 'work';

export type LoreBookParseOperation =
  | {
      kind: 'suggest_add';
      domain: LoreBookParseDomain;
      name: string;
      confidence: number;
      gate: 'auto' | 'suggest' | 'review' | 'block';
    }
  | {
      kind: 'suggest_merge';
      domain: LoreBookParseDomain;
      name: string;
      targetName: string;
      reason: string;
      confidence: number;
    }
  | {
      kind: 'redirect';
      fromDomain: LoreBookParseDomain;
      toDomain: LoreBookParseDomain;
      name: string;
      reason: string;
      confidence: number;
    }
  | {
      kind: 'link';
      relationType: string;
      confidence: number;
    }
  | { kind: 'suppress'; name: string; reason: string };

export type LoreBookParseResponse = {
  operations: LoreBookParseOperation[];
  redirects: LoreBookParseOperation[];
  suppressed: LoreBookParseOperation[];
  warnings: string[];
  lexicalSpanCount: number;
};

export async function fetchLoreBookParse(
  text: string,
  threadId?: string
): Promise<LoreBookParseResponse> {
  return fetchJson<LoreBookParseResponse>('/api/conversation/lorebook-parse', {
    method: 'POST',
    body: JSON.stringify({ text, threadId }),
  });
}

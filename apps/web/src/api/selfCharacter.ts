import { fetchJson } from '../lib/api';
import type { Character } from '../components/characters/CharacterProfileCard';

export type SelfProfileStats = {
  messageCount: number;
  attributeCount: number;
  factCount: number;
  knowledgeClaimCount: number;
  lastSyncedAt: string | null;
};

export type SelfProfileResponse = {
  success: boolean;
  character: Character;
  attributes: Array<{
    attributeType: string;
    attributeValue: string;
    confidence: number;
    isCurrent: boolean;
    evidence?: string;
  }>;
  facts: Array<{
    id: string;
    fact: string;
    category: string;
    confidence: number;
    status: string;
  }>;
  knowledgeClaims: Array<Record<string, unknown>>;
  recentMemories: Array<{
    id: string;
    entry_id: string;
    date: string;
    summary: string | null;
    content: string;
    source: 'chat' | 'journal';
    tags: string[];
  }>;
  stats: SelfProfileStats;
  profileSummary: string | null;
};

export const selfCharacterApi = {
  ensureSelf: () =>
    fetchJson<{ success: boolean; character: Character }>('/api/characters/ensure-self', {
      method: 'POST',
    }),

  syncFromConversations: (options?: { limit?: number; sinceDays?: number }) =>
    fetchJson<{ success: boolean; processed: number; characterId: string | null }>(
      '/api/characters/self/sync',
      {
        method: 'POST',
        body: JSON.stringify(options ?? {}),
      }
    ),

  getProfile: () =>
    fetchJson<SelfProfileResponse>('/api/characters/self/profile'),
};

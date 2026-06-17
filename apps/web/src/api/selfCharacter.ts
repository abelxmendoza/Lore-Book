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
  realName: string | null;
  wittyTagline: string | null;
  roleTagline: string | null;
  contextHooks: string[];
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

  repairIdentity: () =>
    fetchJson<{ success: boolean; repaired: boolean; selfId: string | null; character?: Character }>(
      '/api/characters/self/repair',
      { method: 'POST' }
    ),

  restoreAll: () =>
    fetchJson<{
      success: boolean;
      report: {
        beforeCount: number;
        afterCount: number;
        fromPeoplePlaces: number;
        fromOmegaEntities: number;
        fromMergeHistory: number;
        fromIdentityIndex: number;
        restoredNames: string[];
        skippedNames: string[];
      };
      characterCount: number;
    }>('/api/characters/restore', { method: 'POST' }),

  rescanConversations: () =>
    fetchJson<{
      success: boolean;
      summary: {
        scannedEpisodes: number;
        personsDiscovered: number;
        omegaResolved: number;
        charactersPromoted: number;
        charactersSkipped: number;
        restoredFromEvidence: number;
        promotedNames: string[];
      };
    }>('/api/characters/rescan', { method: 'POST' }),

  inferPublicFigures: () =>
    fetchJson<{
      success: boolean;
      scanned: number;
      publicFigures: number;
      updated: number;
      metInferred: number;
      sceneNetwork: {
        score: number;
        tier: string;
        public_figure_count: number;
        deepest_stage: string;
      } | null;
    }>('/api/characters/public-figures/infer', { method: 'POST' }),

  setLegalName: (legalName: string) =>
    fetchJson<{ success: boolean; legalName: string }>('/api/characters/self/set-legal-name', {
      method: 'POST',
      body: JSON.stringify({ legalName }),
    }),
};

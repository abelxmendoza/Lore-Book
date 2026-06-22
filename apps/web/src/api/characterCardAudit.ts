import { fetchJson } from '../lib/api';

export type CharacterAuditStatus =
  | 'valid_identity'
  | 'valid_contextual_reference'
  | 'needs_context'
  | 'wrong_domain'
  | 'broken_span'
  | 'duplicate_or_merge_candidate'
  | 'junk_test_data'
  | 'bare_title_invalid'
  | 'needs_identity_resolution';

export type CharacterAuditAction =
  | 'keep'
  | 'rename_with_context'
  | 'merge'
  | 'move_to_group'
  | 'move_to_interest'
  | 'delete'
  | 'needs_review';

export type MergeCandidateRef = {
  characterId: string;
  currentTitle: string;
  overlapScore: number;
  reason: string;
};

export type CharacterCardAuditResult = {
  characterId: string;
  currentTitle: string;
  status: CharacterAuditStatus;
  reason: string;
  recommendedAction: CharacterAuditAction;
  suggestedTitle?: string;
  mergeCandidates?: MergeCandidateRef[];
  wrongDomainTarget?: 'group' | 'interest' | 'system';
  provenanceSummary?: string;
  aliasToAdd?: string;
};

export type CharacterCardAuditReport = {
  userId: string;
  generatedAt: string;
  characterCount: number;
  results: CharacterCardAuditResult[];
  summary: Record<CharacterAuditStatus, number>;
};

export const characterCardAuditApi = {
  get: () => fetchJson<CharacterCardAuditReport>('/api/characters/card-audit'),

  resolveKeep: (characterId: string) =>
    fetchJson<{ success: boolean }>(`/api/characters/card-audit/review/${characterId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: 'keep' }),
    }),
  apply: (opts?: { dryRun?: boolean }) =>
    fetchJson<{ success: boolean; report: CharacterCardCleanupReport }>(
      '/api/characters/card-audit/apply',
      { method: 'POST', body: JSON.stringify(opts ?? {}) },
    ),
};

export type CharacterCardCleanupReport = {
  userId: string;
  dryRun: boolean;
  audited: number;
  applied: number;
  skipped: number;
  actions: Array<{
    characterId: string;
    currentTitle: string;
    applied: string;
    reason: string;
    targetTitle?: string;
  }>;
};

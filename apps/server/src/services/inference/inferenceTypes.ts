export type InferenceDomain =
  | 'graph_recovery'
  | 'locations'
  | 'organizations'
  | 'public_figures'
  | 'social_standing'
  | 'character_importance'
  | 'character_rescan'
  | 'relationship_classify'
  | 'achievements_check'
  | 'essence_profile'
  | 'projects_suggestions'
  | 'skills_suggestions'
  | 'quests_suggestions'
  | 'romantic_rescan';

export type InferenceTier = 't1' | 't2';

export type InferenceReason = 'chat_message' | 'session_start' | 'manual' | 'list_stale' | 'journal_save';

export type DomainRunResult = {
  domain: InferenceDomain;
  ok: boolean;
  durationMs: number;
  summary?: Record<string, unknown>;
  error?: string;
};

export type InferenceSyncReport = {
  tier: InferenceTier;
  ran: InferenceDomain[];
  skipped: InferenceDomain[];
  results: DomainRunResult[];
  durationMs: number;
  ranAt: string;
};

export type UserInferenceState = {
  user_id: string;
  last_chat_at: string | null;
  last_t1_run_at: string | null;
  last_t2_run_at: string | null;
  pending_reasons: string[];
  domain_timestamps: Partial<Record<InferenceDomain, string>>;
  last_report: InferenceSyncReport | null;
  updated_at: string;
};

export const T1_DOMAIN_ORDER: InferenceDomain[] = [
  'graph_recovery',
  'locations',
  'organizations',
  'public_figures',
  'social_standing',
  'character_importance',
  'achievements_check',
  'projects_suggestions',
  'skills_suggestions',
  'quests_suggestions',
];

export const T2_EXTRA_DOMAINS: InferenceDomain[] = [
  'character_rescan',
  'relationship_classify',
  'essence_profile',
  'romantic_rescan',
];

export const ALL_DOMAINS: InferenceDomain[] = [...T1_DOMAIN_ORDER, ...T2_EXTRA_DOMAINS];

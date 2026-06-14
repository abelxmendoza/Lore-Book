export type SkillType =
  | 'professional'
  | 'hobby'
  | 'survival'
  | 'creative'
  | 'social'
  | 'technical'
  | 'physical';

export type SkillMonetization = 'paid' | 'potentially_paid' | 'unpaid' | 'hobby_only';

export type SkillUsageFrequency = 'daily' | 'weekly' | 'monthly' | 'rarely';

export type SkillTrajectory = 'improving' | 'stagnant' | 'declining' | 'unknown';

export type SkillEvidence = {
  text: string;
  source_type?: 'chat' | 'journal' | 'quest' | 'manual';
  source_id?: string;
  confidence?: number;
  captured_at?: string;
};

export type SkillProfile = {
  skill_type: SkillType;
  monetization: SkillMonetization;
  proficiency: number;
  enjoyment: number;
  usage_frequency: SkillUsageFrequency;
  trajectory: SkillTrajectory;
  origin_story?: string;
  first_learned_context?: string;
  related_jobs?: string[];
  related_projects?: string[];
  evidence?: SkillEvidence[];
  last_used_at?: string;
  is_active?: boolean;
};

export type ExtractedSkillProfile = {
  skill_name: string;
  skill_category: string;
  skill_type: SkillType;
  monetization: SkillMonetization;
  proficiency: number;
  confidence: number;
  enjoyment: number;
  usage_frequency: SkillUsageFrequency;
  trajectory: SkillTrajectory;
  description?: string;
  origin_story?: string;
  first_learned_context?: string;
  related_jobs?: string[];
  related_projects?: string[];
  /** Parent skill if this is a subskill (e.g. "Armbar" under "Brazilian Jiu-Jitsu"). */
  parent_skill_name?: string;
  /** Peer skills often practiced or learned together. */
  related_skill_names?: string[];
  evidence: string[];
  is_active?: boolean;
};

export function clampScore(value: unknown, fallback = 50): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.round(n)));
}

export function normalizeSkillType(value: unknown): SkillType {
  const v = String(value ?? 'professional').toLowerCase();
  const allowed: SkillType[] = ['professional', 'hobby', 'survival', 'creative', 'social', 'technical', 'physical'];
  return allowed.includes(v as SkillType) ? (v as SkillType) : 'professional';
}

export function normalizeMonetization(value: unknown): SkillMonetization {
  const v = String(value ?? 'unpaid').toLowerCase();
  const allowed: SkillMonetization[] = ['paid', 'potentially_paid', 'unpaid', 'hobby_only'];
  return allowed.includes(v as SkillMonetization) ? (v as SkillMonetization) : 'unpaid';
}

export function normalizeUsageFrequency(value: unknown): SkillUsageFrequency {
  const v = String(value ?? 'rarely').toLowerCase();
  const allowed: SkillUsageFrequency[] = ['daily', 'weekly', 'monthly', 'rarely'];
  return allowed.includes(v as SkillUsageFrequency) ? (v as SkillUsageFrequency) : 'rarely';
}

export function normalizeTrajectory(value: unknown): SkillTrajectory {
  const v = String(value ?? 'unknown').toLowerCase();
  const allowed: SkillTrajectory[] = ['improving', 'stagnant', 'declining', 'unknown'];
  return allowed.includes(v as SkillTrajectory) ? (v as SkillTrajectory) : 'unknown';
}

export function extractedToProfile(extracted: ExtractedSkillProfile, sourceId?: string): SkillProfile {
  return {
    skill_type: normalizeSkillType(extracted.skill_type),
    monetization: normalizeMonetization(extracted.monetization),
    proficiency: clampScore(extracted.proficiency),
    enjoyment: clampScore(extracted.enjoyment),
    usage_frequency: normalizeUsageFrequency(extracted.usage_frequency),
    trajectory: normalizeTrajectory(extracted.trajectory),
    origin_story: extracted.origin_story,
    first_learned_context: extracted.first_learned_context,
    related_jobs: extracted.related_jobs ?? [],
    related_projects: extracted.related_projects ?? [],
    evidence: (extracted.evidence ?? []).map((text) => ({
      text,
      source_id: sourceId,
      confidence: extracted.confidence,
      captured_at: new Date().toISOString(),
    })),
    is_active: extracted.is_active ?? true,
    last_used_at: new Date().toISOString(),
  };
}

export function mergeSkillProfiles(existing: SkillProfile | undefined, incoming: SkillProfile): SkillProfile {
  const evidenceMap = new Map<string, SkillEvidence>();
  for (const e of [...(existing?.evidence ?? []), ...(incoming.evidence ?? [])]) {
    if (e.text?.trim()) evidenceMap.set(e.text.trim().toLowerCase(), e);
  }

  return {
    skill_type: incoming.skill_type ?? existing?.skill_type ?? 'professional',
    monetization: incoming.monetization ?? existing?.monetization ?? 'unpaid',
    proficiency: Math.max(existing?.proficiency ?? 0, incoming.proficiency ?? 0),
    enjoyment: incoming.enjoyment ?? existing?.enjoyment ?? 50,
    usage_frequency: incoming.usage_frequency ?? existing?.usage_frequency ?? 'rarely',
    trajectory: incoming.trajectory ?? existing?.trajectory ?? 'unknown',
    origin_story: incoming.origin_story ?? existing?.origin_story,
    first_learned_context: incoming.first_learned_context ?? existing?.first_learned_context,
    related_jobs: [...new Set([...(existing?.related_jobs ?? []), ...(incoming.related_jobs ?? [])])],
    related_projects: [...new Set([...(existing?.related_projects ?? []), ...(incoming.related_projects ?? [])])],
    evidence: [...evidenceMap.values()].slice(-12),
    is_active: incoming.is_active ?? existing?.is_active ?? true,
    last_used_at: incoming.last_used_at ?? existing?.last_used_at,
  };
}

export function readSkillProfile(metadata: Record<string, unknown> | null | undefined): SkillProfile | undefined {
  const raw = metadata?.skill_profile;
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as SkillProfile;
  return {
    skill_type: normalizeSkillType(p.skill_type),
    monetization: normalizeMonetization(p.monetization),
    proficiency: clampScore(p.proficiency),
    enjoyment: clampScore(p.enjoyment),
    usage_frequency: normalizeUsageFrequency(p.usage_frequency),
    trajectory: normalizeTrajectory(p.trajectory),
    origin_story: p.origin_story,
    first_learned_context: p.first_learned_context,
    related_jobs: p.related_jobs ?? [],
    related_projects: p.related_projects ?? [],
    evidence: p.evidence ?? [],
    last_used_at: p.last_used_at,
    is_active: p.is_active ?? true,
  };
}

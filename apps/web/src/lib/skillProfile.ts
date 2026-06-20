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
  source_type?: string;
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
  related_skill_names?: string[];
  evidence?: SkillEvidence[];
  last_used_at?: string;
  is_active?: boolean;
  /** Canonical narrative — what this skill means in the user's story */
  story_summary?: string;
  /** e.g. Robotics → Software */
  category_domain?: string;
  category_subdomain?: string;
  evidence_score?: number;
  proficiency_breakdown?: {
    knowledge: number;
    experience: number;
    recency: number;
    confidence: number;
  };
  ai_insights?: string[];
};

export function readSkillProfile(metadata: Record<string, unknown> | null | undefined): SkillProfile | undefined {
  const raw = metadata?.skill_profile;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as SkillProfile;
}

export function monetizationLabel(m: SkillMonetization): string {
  switch (m) {
    case 'paid': return 'Pays you';
    case 'potentially_paid': return 'Could pay';
    case 'hobby_only': return 'Hobby only';
    default: return 'Personal';
  }
}

export function usageLabel(f: SkillUsageFrequency): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

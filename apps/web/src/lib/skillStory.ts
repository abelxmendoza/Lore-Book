import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { Skill, SkillMetadata } from '../types/skill';
import type { SkillProfile } from './skillProfile';
import {
  epistemicFieldLabel,
  epistemicLabel,
  formatEpistemicPercent,
  formatEpistemicTitle,
} from './epistemicLabels';

export type SkillLevelLabel =
  | 'Emerging'
  | 'Beginner'
  | 'Intermediate'
  | 'Advanced'
  | 'Expert'
  | 'Master';

/** @deprecated Use epistemicLabel — kept for tests/imports */
export type ConfidenceLabel = ReturnType<typeof epistemicLabel>;

export type SkillStatus = 'active' | 'inactive' | 'dormant' | 'emerging';

export type ProficiencyBreakdown = {
  knowledge: number;
  experience: number;
  recency: number;
  confidence: number;
};

export type SkillStoryBeat = {
  id: string;
  date: string;
  title: string;
  description?: string;
  kind: 'start' | 'milestone' | 'practice' | 'project' | 'career' | 'insight';
};

export type SkillEvidenceItem = {
  id: string;
  source_type: 'chat' | 'project' | 'file' | 'note' | 'import' | 'journal';
  title: string;
  excerpt: string;
  date: string;
  confidence_delta?: number;
};

export type SkillMemoryItem = {
  id: string;
  date: string;
  summary: string;
  source_type: string;
};

export type SkillActivityBucket = {
  label: string;
  count: number;
  categories: Array<{ label: string; count: number }>;
};

const LEVEL_THRESHOLDS: Array<{ min: number; label: SkillLevelLabel }> = [
  { min: 16, label: 'Master' },
  { min: 12, label: 'Expert' },
  { min: 8, label: 'Advanced' },
  { min: 5, label: 'Intermediate' },
  { min: 2, label: 'Beginner' },
  { min: 1, label: 'Emerging' },
];

export function levelLabel(level: number): SkillLevelLabel {
  for (const { min, label } of LEVEL_THRESHOLDS) {
    if (level >= min) return label;
  }
  return 'Emerging';
}

export function levelProgressSegments(level: number): number {
  return Math.min(10, Math.max(4, Math.round(level * 0.8 + 2)));
}

export function confidenceLabel(score: number): string {
  return epistemicLabel(score);
}

/** User-facing field name — not "confidence". */
export function skillCertaintyFieldLabel(): string {
  return epistemicFieldLabel();
}

export function formatSkillCertainty(score: number): string {
  return epistemicLabel(score);
}

export function formatSkillCertaintyDetail(score: number): string {
  return formatEpistemicPercent(score);
}

export function formatSkillCertaintyTitle(score: number): string {
  return formatEpistemicTitle(score);
}

/** Normalize 0–100 evidence score to 0–1 for certainty copy. */
export function evidenceScoreToCertainty(evidenceScore: number): number {
  return Math.max(0, Math.min(1, evidenceScore / 100));
}

export function skillStatus(skill: Skill, profile?: SkillProfile): SkillStatus {
  if (profile?.is_active === false || skill.is_active === false) return 'inactive';
  const daysSince =
    skill.last_practiced_at != null
      ? (Date.now() - parseISO(skill.last_practiced_at).getTime()) / 86_400_000
      : Infinity;
  if (daysSince > 180) return 'dormant';
  if (skill.practice_count <= 2 && skill.current_level <= 2) return 'emerging';
  return 'active';
}

export function statusLabel(status: SkillStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'dormant':
      return 'Dormant';
    case 'emerging':
      return 'Emerging';
  }
}

export function formatCategoryHierarchy(
  category: string,
  domain?: string,
  subdomain?: string,
): string {
  const parts = [domain, subdomain ?? category].filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} → ${parts[1]}`;
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function formatFirstSeen(iso: string): string {
  try {
    return format(parseISO(iso), 'MMMM yyyy');
  } catch {
    return 'Unknown';
  }
}

export function formatLastUsed(iso: string | null | undefined, profile?: SkillProfile): string {
  const date = iso ?? profile?.last_used_at;
  if (!date) return 'Not yet';
  try {
    const parsed = parseISO(date);
    const days = (Date.now() - parsed.getTime()) / 86_400_000;
    if (days < 2) return 'Yesterday';
    if (days < 7) return formatDistanceToNow(parsed, { addSuffix: true });
    return format(parsed, 'MMM d, yyyy');
  } catch {
    return 'Unknown';
  }
}

export function usageCountLabel(count: number): string {
  return `${count.toLocaleString()} conversation${count === 1 ? '' : 's'}`;
}

export function readRelatedSkillNames(metadata: Record<string, unknown> | null | undefined): string[] {
  const profile = metadata?.skill_profile as SkillProfile | undefined;
  if (profile?.related_skill_names?.length) return profile.related_skill_names;
  const raw = metadata?.related_skill_names;
  if (Array.isArray(raw)) return raw.filter((n): n is string => typeof n === 'string');
  return [];
}

export function computeEvidenceScore(skill: Skill, profile?: SkillProfile): number {
  if (profile?.evidence_score != null) return profile.evidence_score;
  const evidence = profile?.evidence ?? [];
  if (evidence.length > 0) {
    const avg =
      evidence.reduce((sum, e) => sum + (e.confidence ?? skill.confidence_score), 0) / evidence.length;
    return Math.round(avg * 100);
  }
  const base = skill.confidence_score * 100;
  const practiceBoost = Math.min(12, skill.practice_count * 0.08);
  return Math.min(99, Math.round(base + practiceBoost));
}

export function computeProficiencyBreakdown(skill: Skill, profile?: SkillProfile): ProficiencyBreakdown {
  if (profile?.proficiency_breakdown) return profile.proficiency_breakdown;

  const proficiency = profile?.proficiency ?? Math.min(100, skill.current_level * 10 + 15);
  const knowledge = Math.min(100, proficiency + (profile?.trajectory === 'improving' ? 5 : 0));
  const experience = Math.min(
    100,
    Math.round(proficiency * 0.85 + Math.min(20, skill.practice_count * 0.15)),
  );

  let recency = 40;
  const last = skill.last_practiced_at ?? profile?.last_used_at;
  if (last) {
    const days = (Date.now() - parseISO(last).getTime()) / 86_400_000;
    if (days <= 1) recency = 100;
    else if (days <= 7) recency = 92;
    else if (days <= 30) recency = 78;
    else if (days <= 90) recency = 55;
    else recency = 30;
  }

  return {
    knowledge,
    experience,
    recency,
    confidence: computeEvidenceScore(skill, profile),
  };
}

export function buildStorySummary(
  skill: Skill,
  profile?: SkillProfile,
  details?: SkillMetadata | null,
): string {
  if (profile?.story_summary) return profile.story_summary;

  const projects = profile?.related_projects?.slice(0, 2).join(' and ');
  const why = details?.why_started?.reason ?? profile?.origin_story ?? profile?.first_learned_context;
  const name = skill.skill_name;

  if (why && projects) {
    return `${why.split('.')[0]}. ${name} continued through ${projects} and shows up across your story.`;
  }
  if (why) return why;
  if (skill.description) return skill.description;
  if (projects) {
    return `${name} shows up while building ${projects} and in conversations about what you're learning next.`;
  }
  return `${name} is part of your story — LoreBook is still gathering the narrative from your chats.`;
}

export function usageFrequencyLabel(frequency?: SkillProfile['usage_frequency']): string {
  switch (frequency) {
    case 'daily':
      return 'Used Daily';
    case 'weekly':
      return 'Used Frequently';
    case 'monthly':
      return 'Used Occasionally';
    case 'rarely':
      return 'Used Rarely';
    default:
      return 'Usage Varies';
  }
}

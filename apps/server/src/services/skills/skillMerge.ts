/**
 * Pure helpers for folding one skill into another (aliases, stats, metadata).
 */

import { normalizeSkillKey } from './skillIdentity';
import { mergeSkillProfiles, readSkillProfile, type SkillProfile } from './skillProfile';
import { calculateLevelFromXP, calculateXPForLevel, type Skill } from './skillService';

export function readSkillAliases(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.aliases;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function uniqSkillNames(...lists: Array<string[] | string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    const values = Array.isArray(list) ? list : list ? [list] : [];
    for (const raw of values) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeSkillKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

export function isMatchableBookSkill(skill: {
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (skill.is_active === false) return false;
  return skill.metadata?.archived !== true;
}

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

function earlierIso(a: string | null | undefined, b: string | null | undefined): string {
  if (!a) return b ?? new Date().toISOString();
  if (!b) return a;
  return a <= b ? a : b;
}

function mergeText(left: string | null | undefined, right: string | null | undefined): string | null {
  const parts = [left, right].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (normalizeSkillKey(parts[0]) === normalizeSkillKey(parts[1])) return parts[0];
  return `${parts[0]}\n\n${parts[1]}`;
}

export type FoldedSkillSurvivor = {
  description: string | null;
  total_xp: number;
  current_level: number;
  xp_to_next_level: number;
  practice_count: number;
  last_practiced_at: string | null;
  first_mentioned_at: string;
  confidence_score: number;
  aliases: string[];
  skill_profile: SkillProfile;
  metadata: Record<string, unknown>;
};

export function foldSkillSurvivor(
  target: Skill,
  source: Skill,
  extraAliases: string[] = [],
): FoldedSkillSurvivor {
  const aliases = uniqSkillNames(
    readSkillAliases(target.metadata),
    readSkillAliases(source.metadata),
    source.skill_name,
    extraAliases,
  ).filter((name) => normalizeSkillKey(name) !== normalizeSkillKey(target.skill_name));

  const incoming = readSkillProfile(source.metadata);
  const existing = readSkillProfile(target.metadata);
  const skill_profile = incoming
    ? mergeSkillProfiles(existing, incoming)
    : existing ?? {
        skill_type: 'professional',
        monetization: 'unpaid',
        proficiency: 50,
        enjoyment: 50,
        usage_frequency: 'rarely',
        trajectory: 'unknown',
        related_jobs: [],
        related_projects: [],
        evidence: [],
        is_active: true,
      };

  const total_xp = (target.total_xp ?? 0) + (source.total_xp ?? 0);
  const current_level = calculateLevelFromXP(total_xp);
  const nextLevelXP = calculateXPForLevel(current_level + 1);
  const xp_to_next_level = Math.max(0, nextLevelXP - total_xp);

  const metadata: Record<string, unknown> = {
    ...(target.metadata ?? {}),
    aliases,
    skill_profile,
    skill_book_visible: true,
  };

  return {
    description: mergeText(target.description, source.description),
    total_xp,
    current_level,
    xp_to_next_level,
    practice_count: (target.practice_count ?? 0) + (source.practice_count ?? 0),
    last_practiced_at: laterIso(target.last_practiced_at, source.last_practiced_at),
    first_mentioned_at: earlierIso(target.first_mentioned_at, source.first_mentioned_at),
    confidence_score: Math.max(target.confidence_score ?? 0, source.confidence_score ?? 0),
    aliases,
    skill_profile,
    metadata,
  };
}

export function archivedMergeMetadata(
  source: Skill,
  target: Skill,
  reason?: string,
): Record<string, unknown> {
  return {
    ...(source.metadata ?? {}),
    archived: true,
    skill_book_visible: false,
    is_active: false,
    migration_status: 'merge',
    merge_target: target.skill_name,
    merge_target_id: target.id,
    migration_reason: reason ?? `Merged into ${target.skill_name}`,
  };
}

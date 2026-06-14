import { supabaseAdmin } from '../supabaseClient';
import type { Skill, SkillCategory } from './skillService';

export type SkillsDbSchema = 'modern' | 'legacy';

let cachedSchema: SkillsDbSchema | null = null;

const VALID_CATEGORIES: SkillCategory[] = [
  'professional', 'creative', 'physical', 'social', 'intellectual',
  'emotional', 'practical', 'artistic', 'technical', 'other',
];

function normalizeCategory(value: unknown): SkillCategory {
  const raw = String(value ?? 'other').toLowerCase().trim();
  return VALID_CATEGORIES.includes(raw as SkillCategory) ? (raw as SkillCategory) : 'other';
}

/** Detect whether PostgREST exposes the modern skills columns or the legacy name/category shape. */
export async function getSkillsDbSchema(): Promise<SkillsDbSchema> {
  if (cachedSchema) return cachedSchema;

  const { error: modernErr } = await supabaseAdmin.from('skills').select('skill_name').limit(0);
  if (!modernErr) {
    cachedSchema = 'modern';
    return cachedSchema;
  }

  const { error: legacyErr } = await supabaseAdmin.from('skills').select('name').limit(0);
  cachedSchema = legacyErr ? 'modern' : 'legacy';
  return cachedSchema;
}

export function invalidateSkillsSchemaCache(): void {
  cachedSchema = null;
}

/** Map a DB row (modern or legacy) into the Skill type the API/UI expect. */
export function normalizeSkillRow(row: Record<string, unknown>): Skill {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const profile = metadata.skill_profile as Record<string, unknown> | undefined;

  const currentLevel = Number(row.current_level ?? metadata.current_level ?? 1);
  const totalXp = Number(row.total_xp ?? metadata.total_xp ?? 0);
  const xpToNext = Number(row.xp_to_next_level ?? metadata.xp_to_next_level ?? 100);

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    skill_name: String(row.skill_name ?? row.name ?? '').trim(),
    skill_category: normalizeCategory(row.skill_category ?? row.category),
    current_level: Number.isFinite(currentLevel) ? currentLevel : 1,
    total_xp: Number.isFinite(totalXp) ? totalXp : 0,
    xp_to_next_level: Number.isFinite(xpToNext) ? xpToNext : 100,
    description: (row.description as string | null | undefined) ?? null,
    first_mentioned_at: String(
      row.first_mentioned_at ?? row.created_at ?? new Date().toISOString()
    ),
    last_practiced_at:
      (row.last_practiced_at as string | null | undefined) ??
      (profile?.last_used_at as string | null | undefined) ??
      null,
    practice_count: Number(row.practice_count ?? metadata.practice_count ?? 0),
    auto_detected: Boolean(row.auto_detected ?? metadata.auto_detected ?? false),
    confidence_score: Number(row.confidence_score ?? metadata.confidence_score ?? 0.5),
    is_active: row.is_active !== false && metadata.is_active !== false,
    metadata,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

/** Build an insert payload for the detected schema. */
export function buildSkillInsertPayload(
  schema: SkillsDbSchema,
  userId: string,
  input: {
    skill_name: string;
    skill_category: SkillCategory;
    description?: string;
    auto_detected?: boolean;
    confidence_score?: number;
    metadata?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const now = new Date().toISOString();
  const metadata = {
    ...(input.metadata ?? {}),
    auto_detected: input.auto_detected ?? false,
    confidence_score: input.confidence_score ?? 0.5,
    current_level: 1,
    total_xp: 0,
    xp_to_next_level: 100,
    is_active: true,
    practice_count: 0,
  };

  if (schema === 'legacy') {
    return {
      user_id: userId,
      name: input.skill_name,
      category: input.skill_category,
      description: input.description ?? null,
      metadata,
      created_at: now,
      updated_at: now,
    };
  }

  return {
    user_id: userId,
    skill_name: input.skill_name,
    skill_category: input.skill_category,
    description: input.description ?? null,
    auto_detected: input.auto_detected ?? false,
    confidence_score: input.confidence_score ?? 0.5,
    metadata: input.metadata ?? {},
    first_mentioned_at: now,
    current_level: 1,
    total_xp: 0,
    xp_to_next_level: 100,
    is_active: true,
    practice_count: 0,
  };
}

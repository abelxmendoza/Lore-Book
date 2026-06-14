import type { QuestType } from '../services/quests/types';

const VALID_TYPES = new Set<QuestType>(['main', 'side', 'daily', 'achievement']);

/** Coerce LLM / client values into a valid quest type. */
export function normalizeQuestType(value: unknown): QuestType {
  const raw = String(value ?? 'side').toLowerCase().trim();
  if (VALID_TYPES.has(raw as QuestType)) return raw as QuestType;
  if (raw === 'weekly' || raw === 'monthly') return 'side';
  if (raw.includes('daily') || raw.includes('habit')) return 'daily';
  if (raw.includes('main') || raw.includes('primary') || raw.includes('career')) return 'main';
  if (raw.includes('achievement') || raw.includes('milestone')) return 'achievement';
  return 'side';
}

/** Clamp priority/importance/impact to 1–10. */
export function clampQuestScore(value: unknown, fallback = 5): number {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** Drop null/empty optional strings before API validation. */
export function optionalQuestString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

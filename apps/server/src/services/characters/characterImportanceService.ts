/**
 * Sprint AL-1 — Character Importance Engine (deterministic, no LLM)
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type ImportanceLevel = 'legendary' | 'major' | 'supporting' | 'minor' | 'background';

export type ImportanceInputs = {
  mentionCount: number;
  distinctMemories: number;
  distinctEvents: number;
  timelineAppearances: number;
  relationshipCount: number;
  conversationFrequency: number;
  recencyDays: number | null;
  isFamily: boolean;
  isSelf: boolean;
  relationshipTypeWeight: number;
  structuralImportanceFloor?: number;
};

export type ImportanceResult = {
  importanceScore: number;
  importanceLevel: ImportanceLevel;
  inputs: ImportanceInputs;
};

const FAMILY_REL =
  /family|parent|child|sibling|grand|abuela|abuelo|mother|father|brother|sister|aunt|uncle|t[ií]o|t[ií]a|cousin|spouse|wife|husband/i;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function computeImportanceScore(inputs: ImportanceInputs): number {
  if (inputs.isSelf) return 100;

  let score = 0;

  score += Math.min(25, inputs.mentionCount * 2);
  score += Math.min(20, inputs.distinctMemories * 4);
  score += Math.min(15, inputs.distinctEvents * 3);
  score += Math.min(10, inputs.timelineAppearances * 2);
  score += Math.min(10, inputs.relationshipCount * 3);
  score += Math.min(10, inputs.conversationFrequency * 2);
  score += inputs.relationshipTypeWeight * 10;

  if (inputs.recencyDays !== null) {
    const recencyBoost = inputs.recencyDays <= 7 ? 10 : inputs.recencyDays <= 30 ? 7 : inputs.recencyDays <= 90 ? 4 : 0;
    score += recencyBoost;
  }

  if (inputs.isFamily) score += 15;

  const flooredScore = Math.max(score, inputs.structuralImportanceFloor ?? 0);
  return clamp(Math.round(flooredScore), 0, 100);
}

export function scoreToLevel(score: number, isSelf: boolean): ImportanceLevel {
  if (isSelf) return 'legendary';
  if (score >= 80) return 'legendary';
  if (score >= 60) return 'major';
  if (score >= 40) return 'supporting';
  if (score >= 20) return 'minor';
  return 'background';
}

export function computeImportance(inputs: ImportanceInputs): ImportanceResult {
  const importanceScore = computeImportanceScore(inputs);
  return {
    importanceScore,
    importanceLevel: scoreToLevel(importanceScore, inputs.isSelf),
    inputs,
  };
}

function relationshipTypeWeight(type: string | null | undefined): number {
  if (!type) return 0.2;
  const t = type.toLowerCase();
  if (/mother|father|mom|dad|parent|child|daughter|son|grand|abuela|abuelo|grandmother|grandfather|spouse|wife|husband/.test(t)) return 1;
  if (/sibling|brother|sister/.test(t)) return 0.95;
  if (FAMILY_REL.test(t)) return 0.9;
  if (/partner|romantic|spouse|boyfriend|girlfriend|wife|husband|crush|lover/.test(t)) return 0.85;
  if (/mentor|boss|manager|colleague|work|professional/.test(t)) return 0.5;
  if (/friend|close/.test(t)) return 0.65;
  return 0.3;
}

function structuralFamilyFloor(name: string, relationshipTypes: string[]): number {
  const text = [name, ...relationshipTypes].join(' ').toLowerCase();
  if (/mother|father|mom|dad|parent|grand|abuela|abuelo|grandmother|grandfather|child|daughter|son|spouse|wife|husband/.test(text)) {
    return 65;
  }
  if (/sibling|brother|sister/.test(text)) return 60;
  if (/t[ií]o|t[ií]a|uncle|aunt/.test(text)) return 50;
  if (/cousin|family/.test(text)) return 40;
  return 0;
}

async function gatherInputs(userId: string, characterId: string): Promise<ImportanceInputs> {
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('name, metadata, importance_level, created_at')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  const meta = (character?.metadata ?? {}) as Record<string, unknown>;
  const isSelf = meta.is_self === true || /^you$/i.test(character?.name ?? '');

  const [{ count: memoryCount }, { count: eventCount }, { count: timelineCount }, { data: rels }] =
    await Promise.all([
      supabaseAdmin
        .from('character_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', characterId),
      supabaseAdmin
        .from('character_timeline_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', characterId),
      supabaseAdmin
        .from('character_timeline_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', characterId),
      supabaseAdmin
        .from('character_relationships')
        .select('relationship_type')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`),
    ]);

  const name = character?.name ?? '';
  const mentionFromMeta = typeof meta.mention_count === 'number' ? meta.mention_count : 0;

  let mentionCount = mentionFromMeta;
  let lastMentionMs: number | null = null;

  if (name.length >= 2) {
    const { data: chatRows } = await supabaseAdmin
      .from('chat_messages')
      .select('created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .ilike('content', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    const chatMentions = chatRows?.length ?? 0;
    mentionCount = Math.max(mentionCount, chatMentions);
    if (chatRows?.[0]?.created_at) {
      lastMentionMs = new Date(chatRows[0].created_at as string).getTime();
    }
  }

  const createdMs = character?.created_at ? new Date(character.created_at).getTime() : Date.now();
  const daysSinceCreated = Math.max(1, (Date.now() - createdMs) / (1000 * 60 * 60 * 24));
  const conversationFrequency = mentionCount / (daysSinceCreated / 30);

  const recencyDays = lastMentionMs
    ? (Date.now() - lastMentionMs) / (1000 * 60 * 60 * 24)
    : null;

  const relTypes = (rels ?? []).map((r) => r.relationship_type as string);
  const isFamily =
    relTypes.some((t) => FAMILY_REL.test(t)) ||
    FAMILY_REL.test(name);

  const maxRelWeight = relTypes.reduce(
    (max, t) => Math.max(max, relationshipTypeWeight(t)),
    0
  );

  return {
    mentionCount,
    distinctMemories: memoryCount ?? 0,
    distinctEvents: eventCount ?? 0,
    timelineAppearances: timelineCount ?? 0,
    relationshipCount: rels?.length ?? 0,
    conversationFrequency,
    recencyDays,
    isFamily,
    isSelf,
    relationshipTypeWeight: maxRelWeight,
    structuralImportanceFloor: structuralFamilyFloor(name, relTypes),
  };
}

export async function calculateCharacterImportance(
  userId: string,
  characterId: string
): Promise<ImportanceResult> {
  const inputs = await gatherInputs(userId, characterId);
  return computeImportance(inputs);
}

export async function persistCharacterImportance(
  userId: string,
  characterId: string,
  result: ImportanceResult
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('characters')
    .select('metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;

  const dbLevel =
    result.importanceLevel === 'legendary' && !result.inputs.isSelf
      ? 'major'
      : result.importanceLevel === 'legendary'
        ? 'protagonist'
        : result.importanceLevel;

  await supabaseAdmin
    .from('characters')
    .update({
      importance_score: result.importanceScore,
      importance_level: dbLevel,
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        al_importance: {
          level: result.importanceLevel,
          score: result.importanceScore,
          computed_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', characterId)
    .eq('user_id', userId);
}

export async function scoreAndPersistCharacter(
  userId: string,
  characterId: string
): Promise<ImportanceResult> {
  const result = await calculateCharacterImportance(userId, characterId);
  await persistCharacterImportance(userId, characterId, result);
  return result;
}

export async function scoreAllCharactersForUser(userId: string): Promise<{ scored: number }> {
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId);

  let scored = 0;
  for (const c of chars ?? []) {
    try {
      await scoreAndPersistCharacter(userId, c.id);
      scored++;
    } catch (err) {
      logger.warn({ err, characterId: c.id }, 'AL character importance scoring failed');
    }
  }
  return { scored };
}

export async function getCharacterImportanceCoverage(userId: string): Promise<{
  total: number;
  scored: number;
  coverage_pct: number;
}> {
  const { count: total } = await supabaseAdmin
    .from('characters')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: scored } = await supabaseAdmin
    .from('characters')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('importance_score', 0);

  const t = total ?? 0;
  const s = scored ?? 0;
  return {
    total: t,
    scored: s,
    coverage_pct: t > 0 ? Math.round((s / t) * 1000) / 10 : 0,
  };
}

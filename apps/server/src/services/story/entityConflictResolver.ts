/**
 * Sprint AM-4 — Duplicate Character Intelligence
 *
 * Detects potential identity conflicts (e.g. two "Juan" characters).
 * Never merges automatically — surfaces conflict for user/system awareness.
 */

import { supabaseAdmin } from '../supabaseClient';

export type EntityConflict = {
  sharedToken: string;
  reason: string;
  characters: Array<{
    id: string;
    name: string;
    category: string;
    memoryCount: number;
    relationshipHint: string | null;
  }>;
  recommendation: string;
};

const FAMILY_RE =
  /family|grand|abuela|abuelo|mother|father|brother|sister|aunt|uncle|t[ií]o|t[ií]a|cousin|parent|child|spouse|son|daughter/i;
const SCENE_RE = /goth|scene|club|metro|party|hell fairy|oscuri|dad|stranger|acquaintance/i;
const ROMANTIC_RE = /romantic|partner|crush|dating|boyfriend|girlfriend|hookup|lover|ashley|sol/i;

function firstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? name;
  return first.replace(/^(T[ií]o|T[ií]a)\s+/i, '').toLowerCase();
}

function categorizeCharacter(name: string, relTypes: string[]): string {
  const text = [name, ...relTypes].join(' ').toLowerCase();
  if (FAMILY_RE.test(text) || /^(abuela|t[ií]o|t[ií]a)/i.test(name)) return 'Family';
  if (ROMANTIC_RE.test(text)) return 'Romantic';
  if (SCENE_RE.test(text)) return 'Scene / Community';
  if (/work|colleague|kelly|amazon|professional/i.test(text)) return 'Professional';
  return 'Other';
}

export async function detectNameConflicts(
  userId: string,
  queryName?: string
): Promise<EntityConflict[]> {
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata, importance_score')
    .eq('user_id', userId);

  if (!chars?.length) return [];

  const charIds = chars.map((c) => c.id);
  const [{ data: rels }, { data: memCounts }] = await Promise.all([
    supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type')
      .eq('user_id', userId),
    supabaseAdmin
      .from('character_memories')
      .select('character_id')
      .eq('user_id', userId)
      .in('character_id', charIds),
  ]);

  const relsByChar = new Map<string, string[]>();
  for (const rel of rels ?? []) {
    for (const id of [rel.source_character_id, rel.target_character_id]) {
      const list = relsByChar.get(id) ?? [];
      list.push(rel.relationship_type as string);
      relsByChar.set(id, list);
    }
  }

  const memCountByChar = new Map<string, number>();
  for (const m of memCounts ?? []) {
    memCountByChar.set(m.character_id, (memCountByChar.get(m.character_id) ?? 0) + 1);
  }

  const byFirstName = new Map<string, typeof chars>();
  for (const c of chars) {
    if ((c.metadata as Record<string, unknown>)?.is_self) continue;
    const token = firstName(c.name);
    if (token.length < 2) continue;
    const group = byFirstName.get(token) ?? [];
    group.push(c);
    byFirstName.set(token, group);
  }

  const conflicts: EntityConflict[] = [];

  for (const [token, group] of byFirstName) {
    if (group.length < 2) continue;
    if (queryName && !queryName.toLowerCase().includes(token) && firstName(queryName) !== token) {
      continue;
    }

    const entries = group.map((c) => {
      const relTypes = relsByChar.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.name,
        category: categorizeCharacter(c.name, relTypes),
        memoryCount: memCountByChar.get(c.id) ?? 0,
        relationshipHint: relTypes[0]?.replace(/_/g, ' ') ?? null,
      };
    });

    const categories = [...new Set(entries.map((e) => e.category))];
    conflicts.push({
      sharedToken: token,
      reason: `Shared first name "${token}" across ${group.length} character(s)`,
      characters: entries,
      recommendation:
        categories.length > 1
          ? `Potential identity conflict — ${categories.join(' vs ')}. Do NOT merge automatically.`
          : `Multiple "${token}" records in same category — verify they are distinct people.`,
    });
  }

  return conflicts;
}

export function formatConflictWarning(conflicts: EntityConflict[]): string | null {
  if (!conflicts.length) return null;

  const lines = ['**Potential identity conflict**', ''];
  for (const c of conflicts) {
    lines.push(`**${c.reason}**`);
    for (const ch of c.characters) {
      lines.push(
        `• **${ch.name}** (${ch.category}) — ${ch.memoryCount} ${ch.memoryCount === 1 ? 'memory' : 'memories'}${ch.relationshipHint ? `, ${ch.relationshipHint}` : ''}`
      );
    }
    lines.push(`_${c.recommendation}_`, '');
  }
  return lines.join('\n');
}

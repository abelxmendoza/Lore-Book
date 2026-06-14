/**
 * Certified Entity Index — entities with UI cards/modals in the Books.
 * Each entry is addressable by stable UUID and indexed by name + aliases.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

export type CertifiedEntityType = 'character' | 'location' | 'organization' | 'skill' | 'event';

export type CertifiedEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  aliases: string[];
  /** Normalized lowercase keys for fast mention matching */
  mentionKeys: string[];
};

function mentionKeysFor(name: string, aliases: string[]): string[] {
  const keys = new Set<string>();
  const primary = normalizeNameKey(name);
  if (primary) keys.add(primary);
  for (const alias of aliases) {
    const k = normalizeNameKey(alias);
    if (k) keys.add(k);
  }
  return [...keys];
}

function pushEntity(
  map: Map<string, CertifiedEntity>,
  entity: CertifiedEntity
): void {
  const existing = map.get(`${entity.type}:${entity.id}`);
  if (!existing) {
    map.set(`${entity.type}:${entity.id}`, entity);
    return;
  }
  const aliases = new Set([...existing.aliases, ...entity.aliases]);
  const mentionKeys = new Set([...existing.mentionKeys, ...entity.mentionKeys]);
  map.set(`${entity.type}:${entity.id}`, {
    ...existing,
    name: existing.name || entity.name,
    aliases: [...aliases],
    mentionKeys: [...mentionKeys],
  });
}

export async function listCertifiedEntities(userId: string): Promise<CertifiedEntity[]> {
  const map = new Map<string, CertifiedEntity>();

  const [
    identityRows,
    charactersFallback,
    locationsRes,
    orgsRes,
    skillsRes,
    eventsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('character_identity_index')
      .select('character_id, mention, mention_key, character:characters(id, name, alias)')
      .eq('user_id', userId)
      .then((r) => r.data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId)
      .then((r) => r.data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from('locations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .then((r) => r.data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from('organizations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .then((r) => r.data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from('skills')
      .select('id, skill_name, metadata')
      .eq('user_id', userId)
      .then((r) => r.data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from('timeline_events')
      .select('id, title, context')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(500)
      .then((r) => r.data ?? [])
      .catch(() => []),
  ]);

  // Characters — prefer identity index (canonical mentions)
  const charAliases = new Map<string, Set<string>>();
  const charNames = new Map<string, string>();
  for (const row of identityRows as Array<{
    character_id: string;
    mention: string;
    character?: { id: string; name: string; alias?: string[] | null };
  }>) {
    if (!row.character_id) continue;
    charNames.set(row.character_id, row.character?.name ?? row.mention);
    const set = charAliases.get(row.character_id) ?? new Set<string>();
    if (row.mention && row.mention !== row.character?.name) set.add(row.mention);
    for (const a of row.character?.alias ?? []) set.add(a);
    charAliases.set(row.character_id, set);
  }
  for (const c of charactersFallback as Array<{ id: string; name: string; alias?: string[] | null }>) {
    if (!charNames.has(c.id)) charNames.set(c.id, c.name);
    const set = charAliases.get(c.id) ?? new Set<string>();
    for (const a of c.alias ?? []) set.add(a);
    charAliases.set(c.id, set);
  }
  for (const [id, name] of charNames) {
    const aliases = [...(charAliases.get(id) ?? [])].filter((a) => a !== name);
    pushEntity(map, {
      id,
      name,
      type: 'character',
      aliases,
      mentionKeys: mentionKeysFor(name, aliases),
    });
  }

  for (const loc of locationsRes as Array<{ id: string; name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (loc.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: loc.id,
      name: loc.name,
      type: 'location',
      aliases,
      mentionKeys: mentionKeysFor(loc.name, aliases),
    });
  }

  for (const org of orgsRes as Array<{ id: string; name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (org.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: org.id,
      name: org.name,
      type: 'organization',
      aliases,
      mentionKeys: mentionKeysFor(org.name, aliases),
    });
  }

  for (const skill of skillsRes as Array<{ id: string; skill_name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (skill.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: skill.id,
      name: skill.skill_name,
      type: 'skill',
      aliases,
      mentionKeys: mentionKeysFor(skill.skill_name, aliases),
    });
  }

  for (const ev of eventsRes as Array<{ id: string; title: string; context?: Record<string, unknown> }>) {
    const aliases = (ev.context?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: ev.id,
      name: ev.title,
      type: 'event',
      aliases,
      mentionKeys: mentionKeysFor(ev.title, aliases),
    });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve certified entities mentioned in free text (word-boundary aware). */
export function matchCertifiedEntitiesInText(
  text: string,
  index: CertifiedEntity[]
): CertifiedEntity[] {
  if (!text.trim() || index.length === 0) return [];
  const lower = text.toLowerCase();
  const matched = new Map<string, CertifiedEntity>();

  for (const entity of index) {
    const labels = [entity.name, ...entity.aliases].filter((l) => l.length >= 2);
    labels.sort((a, b) => b.length - a.length);
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
      if (re.test(lower) || re.test(text)) {
        matched.set(`${entity.type}:${entity.id}`, entity);
        break;
      }
    }
  }

  return [...matched.values()];
}

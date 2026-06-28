/**
 * History-aware checking — attach inferences to existing entities instead of duplicating.
 */
import { supabaseAdmin } from '../supabaseClient';
import { normalizeLexicalText } from '../lexical/lexicalNormalizer';
import type { HistoryContext } from './inferenceAssociationTypes';

function norm(s: string): string {
  return normalizeLexicalText(s);
}

export async function loadHistoryContext(userId: string): Promise<HistoryContext> {
  const people = new Map<string, { id: string; name: string; aliases: string[] }>();
  const groups = new Map<string, { id: string; name: string }>();
  const schools = new Map<string, { id: string; name: string }>();
  const employers = new Map<string, { id: string; name: string }>();
  const worksites = new Map<string, { id: string; name: string }>();
  const places = new Map<string, { id: string; name: string }>();
  const streetCommunities = new Map<string, { id: string; name: string }>();
  const skills = new Set<string>();
  const hobbies = new Set<string>();

  try {
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId);
    for (const c of chars ?? []) {
      const name = String(c.name ?? '').trim();
      if (!name) continue;
      const aliases = Array.isArray(c.alias) ? c.alias.map(String) : [];
      people.set(norm(name), { id: c.id, name, aliases });
      for (const a of aliases) {
        if (a.trim()) people.set(norm(a), { id: c.id, name, aliases });
      }
    }
  } catch {
    // characters table may be absent in test env
  }

  try {
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name, type')
      .eq('user_id', userId);
    for (const o of orgs ?? []) {
      const name = String(o.name ?? '').trim();
      if (!name) continue;
      const key = norm(name);
      const type = String(o.type ?? '').toLowerCase();
      if (/street_community|community/.test(type)) {
        streetCommunities.set(key, { id: o.id, name });
      } else if (/school|university|college/.test(type)) {
        schools.set(key, { id: o.id, name });
      } else if (/company|employer|startup|corporation|robotics/.test(type)) {
        employers.set(key, { id: o.id, name });
      } else if (/worksite|deployment|venue|customer_site/.test(type)) {
        worksites.set(key, { id: o.id, name });
      } else if (/club|group|team|class/.test(type)) {
        groups.set(key, { id: o.id, name });
      } else {
        places.set(key, { id: o.id, name });
      }
    }
  } catch {
    // organizations optional
  }

  try {
    const { data: skillRows } = await supabaseAdmin
      .from('skills')
      .select('skill_name')
      .eq('user_id', userId);
    for (const s of skillRows ?? []) {
      const n = String(s.skill_name ?? '').trim();
      if (n) skills.add(norm(n));
    }
  } catch {
    // skills optional
  }

  return { people, groups, schools, employers, worksites, places, streetCommunities, skills, hobbies };
}

export function matchExistingSchool(history: HistoryContext, name?: string) {
  if (name) {
    return history.schools.get(norm(name)) ?? null;
  }
  if (history.schools.size === 1) {
    return [...history.schools.values()][0];
  }
  return null;
}

export function matchExistingPerson(
  history: HistoryContext,
  name: string
): { id: string; name: string; aliasLikely: boolean } | null {
  const key = norm(name);
  const direct = history.people.get(key);
  if (direct) return { id: direct.id, name: direct.name, aliasLikely: direct.name.toLowerCase() !== name.toLowerCase() };

  for (const [, p] of history.people) {
    if (p.aliases.some((a) => norm(a) === key)) {
      return { id: p.id, name: p.name, aliasLikely: true };
    }
  }
  return null;
}

export function matchExistingGroup(history: HistoryContext, name: string) {
  return history.groups.get(norm(name)) ?? null;
}

export function matchExistingEmployer(history: HistoryContext, name: string) {
  return history.employers.get(norm(name)) ?? null;
}

export function matchExistingWorksite(history: HistoryContext, name: string) {
  const key = norm(name);
  return history.worksites.get(key) ?? history.places.get(key) ?? null;
}

export function matchExistingStreetCommunity(history: HistoryContext, streetName: string) {
  const communityName = `${streetName} Community`.toLowerCase();
  for (const [key, val] of history.streetCommunities) {
    if (key.includes(norm(streetName)) || norm(val.name).includes(norm(streetName))) {
      return val;
    }
  }
  if (history.streetCommunities.has(norm(communityName))) {
    return history.streetCommunities.get(norm(communityName))!;
  }
  return null;
}

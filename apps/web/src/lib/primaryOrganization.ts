/**
 * Pick the main group affiliation for a character card from org roster data.
 * Prefer server-provided primary_organization when present.
 */

export type PrimaryOrganization = {
  id: string;
  name: string;
  group_type?: string;
  role?: string | null;
  status?: string;
};

type OrgLike = {
  id: string;
  name?: string | null;
  type?: string | null;
  group_type?: string | null;
  usage_count?: number | null;
  status?: string | null;
  members?: Array<{
    character_id?: string | null;
    character_name?: string | null;
    role?: string | null;
    status?: string | null;
  }> | null;
};

type CharacterLike = {
  id: string;
  name?: string | null;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
  primary_organization?: PrimaryOrganization | null;
};

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMembership(
  membership: { role?: string | null; status?: string | null },
  org: OrgLike,
  preferred: boolean,
): number {
  let s = 0;
  if (preferred) s += 1000;
  const mStatus = String(membership.status ?? 'active').toLowerCase();
  if (mStatus === 'active') s += 100;
  else if (mStatus === 'honorary') s += 40;
  else if (mStatus === 'former') s += 15;
  const role = String(membership.role ?? '').toLowerCase();
  if (/head|founder|leader|owner|captain/.test(role)) s += 55;
  else if (/member|resident/.test(role)) s += 25;
  const gType = String(org.group_type ?? org.type ?? '').toLowerCase();
  if (/company|employer|work|brand|vendor/.test(gType)) s += 45;
  else if (/friend_group|crew|band|club|team|sports|household|family|martial/.test(gType)) s += 35;
  if (String(org.status ?? 'active') === 'active') s += 10;
  s += Math.min(25, Number(org.usage_count ?? 0));
  return s;
}

function characterNameKeys(character: CharacterLike): Set<string> {
  const keys = new Set<string>();
  if (character.name) keys.add(normalizeKey(character.name));
  for (const alias of character.alias ?? []) {
    if (alias) keys.add(normalizeKey(alias));
  }
  return keys;
}

export function pickPrimaryOrganization(
  character: CharacterLike,
  organizations: OrgLike[],
): PrimaryOrganization | null {
  if (character.primary_organization?.name) return character.primary_organization;
  if (!organizations.length) return null;

  const meta = character.metadata ?? {};
  const preferredId =
    (typeof meta.primary_organization_id === 'string' && meta.primary_organization_id) ||
    (typeof meta.primary_group_id === 'string' && meta.primary_group_id) ||
    undefined;

  const nameKeys = characterNameKeys(character);
  let best: { org: OrgLike; role?: string | null; status?: string; score: number } | null = null;

  for (const org of organizations) {
    if (!org?.id || !org.name) continue;
    for (const member of org.members ?? []) {
      const byId = member.character_id && member.character_id === character.id;
      const byName = member.character_name ? nameKeys.has(normalizeKey(member.character_name)) : false;
      if (!byId && !byName) continue;
      const score = scoreMembership(member, org, Boolean(preferredId && preferredId === org.id));
      if (!best || score > best.score) {
        best = {
          org,
          role: member.role,
          status: member.status ?? 'active',
          score,
        };
      }
    }
  }

  if (!best) return null;
  return {
    id: best.org.id,
    name: String(best.org.name),
    group_type: String(best.org.group_type ?? best.org.type ?? '') || undefined,
    role: best.role ?? null,
    status: best.status,
  };
}

export function withPrimaryOrganizations<T extends CharacterLike>(
  characters: T[],
  organizations: OrgLike[],
): T[] {
  if (!characters.length) return characters;
  return characters.map((character) => {
    if (character.primary_organization?.name) return character;
    const primary = pickPrimaryOrganization(character, organizations);
    return primary ? { ...character, primary_organization: primary } : character;
  });
}

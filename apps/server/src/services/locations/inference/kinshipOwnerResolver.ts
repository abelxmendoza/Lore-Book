/**
 * Kinship-title owner resolution for place names.
 *
 * A kinship title must be connected to a NAME: "Tia's House" from "at my
 * tia's" is ambiguous — which tía? This resolver looks the bare title up in
 * the user's family data (characters with title-leading names like "Tía
 * Grace" / "Tia Lourdes", or a matching kinship role) and either binds the
 * place to the one named relative it can mean, or reports the candidates so
 * the suggestion goes to review instead of silently guessing.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { supabaseAdmin } from '../../supabaseClient';

export type KinshipOwnerResolution =
  | { status: 'resolved'; ownerName: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'unknown' };

/** Synonym groups: any title in a group can name the same relative. */
const KINSHIP_GROUPS: Array<{ relation: string; titles: string[] }> = [
  { relation: 'aunt', titles: ['tia', 'tía', 'aunt', 'auntie'] },
  { relation: 'uncle', titles: ['tio', 'tío', 'uncle'] },
  { relation: 'grandmother', titles: ['abuela', 'abuelita', 'grandma', 'grandmother', 'nana'] },
  { relation: 'grandfather', titles: ['abuelo', 'abuelito', 'grandpa', 'grandfather'] },
  { relation: 'mother', titles: ['mom', 'mother', 'mama', 'mamá'] },
  { relation: 'father', titles: ['dad', 'father', 'papa', 'papá'] },
  { relation: 'cousin', titles: ['cousin', 'primo', 'prima'] },
];

/**
 * Bare-kinship possessive place name: "Tia's House", "Mom's Place",
 * "Abuela's Casa" — a title with no personal name attached.
 */
const BARE_KINSHIP_RESIDENCE =
  /^(?:my\s+|our\s+|the\s+)?(tia|tía|tio|tío|aunt|auntie|uncle|abuela|abuelita|abuelo|abuelito|grandma|grandmother|grandpa|grandfather|nana|mom|mother|mama|mamá|dad|father|papa|papá|prima|primo|cousin)(?:[’']s)?\s+(house|home|place|apartment|condo|casa|office|clinic)$/i;

export function parseBareKinshipResidence(
  name: string,
): { title: string; placeLabel: string } | null {
  const m = name.trim().match(BARE_KINSHIP_RESIDENCE);
  if (!m) return null;
  return { title: m[1], placeLabel: m[2] };
}

function groupForTitle(title: string): { relation: string; titles: string[] } | null {
  const key = normalizeNameKey(title);
  return KINSHIP_GROUPS.find((g) => g.titles.some((t) => normalizeNameKey(t) === key)) ?? null;
}

/** A card literally named "Abuela"/"Mom" is itself an unnamed title, not a resolution. */
function isBareKinshipName(name: string): boolean {
  const key = normalizeNameKey(name);
  return KINSHIP_GROUPS.some((g) => g.titles.some((t) => normalizeNameKey(t) === key));
}

type CharacterRow = {
  name: string | null;
  alias: string[] | null;
  role: string | null;
  archetype: string | null;
};

/**
 * Title-leading name match ("Tía Grace", "Tio Ralph") — the same rule the
 * family tree uses: the kinship word must LEAD and be followed by a real name,
 * so stage names like "Goth Tio" never match.
 */
function titleLeadingMatch(candidate: string, titles: string[]): boolean {
  const m = candidate.trim().match(/^([\p{L}]+)\s+[\p{Lu}][\p{L}'’-]+/u);
  if (!m) return false;
  const lead = normalizeNameKey(m[1]);
  return titles.some((t) => normalizeNameKey(t) === lead);
}

export async function resolveKinshipOwner(
  userId: string,
  title: string,
  loadCharacters: (userId: string) => Promise<CharacterRow[]> = defaultLoadCharacters,
): Promise<KinshipOwnerResolution> {
  const group = groupForTitle(title);
  if (!group) return { status: 'unknown' };

  const rows = await loadCharacters(userId);
  const owners = new Map<string, string>();

  for (const row of rows) {
    const names = [row.name, ...(row.alias ?? [])].filter((n): n is string => Boolean(n?.trim()));
    const titled = names.find((n) => titleLeadingMatch(n, group.titles));
    if (titled) {
      owners.set(normalizeNameKey(titled), titled.trim());
      continue;
    }
    // Role-based: a character named "Grace" whose role/archetype says aunt.
    // A card named just "Abuela"/"Mom" carries no personal name — skip it.
    const role = normalizeNameKey(row.role ?? '');
    if (
      row.name &&
      !isBareKinshipName(row.name) &&
      role &&
      (role === group.relation || group.titles.some((t) => normalizeNameKey(t) === role))
    ) {
      const composed = `${titleCase(title)} ${row.name.trim()}`;
      owners.set(normalizeNameKey(composed), composed);
    }
  }

  const names = [...owners.values()];
  if (names.length === 1) return { status: 'resolved', ownerName: names[0] };
  if (names.length > 1) return { status: 'ambiguous', candidates: names };
  return { status: 'unknown' };
}

function titleCase(value: string): string {
  if (/^t[ií]a$/i.test(value)) return 'Tía';
  if (/^t[ií]o$/i.test(value)) return 'Tío';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

async function defaultLoadCharacters(userId: string): Promise<CharacterRow[]> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('name, alias, role, archetype')
    .eq('user_id', userId);
  return (data ?? []) as CharacterRow[];
}

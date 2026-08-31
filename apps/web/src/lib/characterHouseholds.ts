import { isHouseholdGroup } from './groupTaxonomy';
import type { Organization, OrganizationMember } from '../components/organizations/OrganizationProfileCard';

export type CharacterOrganization = Organization & {
  user_is_member?: boolean;
  character_role?: string;
  character_member_notes?: string;
};

const FORMER_ROLE_RE = /former/;
const WEEKEND_ROLE_RE = /weekend/;
const SPLIT_ROLE_RE = /split/;
const VISITOR_ROLE_RE = /visit|guest/;
const HEAD_ROLE_RE = /head of household|^head$|elder/;
const LIVES_HERE_RE = /lives here|resident|member/;

export function memberMatchesCharacter(
  member: Pick<OrganizationMember, 'character_id' | 'character_name'>,
  characterId?: string | null,
  characterName?: string | null,
  isSelf = false,
): boolean {
  if (characterId && member.character_id && member.character_id === characterId) return true;
  const memberName = member.character_name.trim().toLowerCase();
  if (isSelf && memberName === 'you') return true;
  const name = characterName?.trim().toLowerCase();
  if (!name) return false;
  return memberName === name;
}

export function characterMembership(
  org: Pick<CharacterOrganization, 'members' | 'character_role'>,
  characterId?: string | null,
  characterName?: string | null,
  isSelf = false,
): OrganizationMember | undefined {
  return (org.members ?? []).find((member) =>
    memberMatchesCharacter(member, characterId, characterName, isSelf),
  );
}

export function characterHouseholdRole(
  org: CharacterOrganization,
  characterId?: string | null,
  characterName?: string | null,
  isSelf = false,
): string {
  const member = characterMembership(org, characterId, characterName, isSelf);
  const raw = (member?.role || org.character_role || '').trim();
  return raw || 'lives here';
}

export function formatHouseholdRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase().replace(/_/g, ' ');
  if (FORMER_ROLE_RE.test(normalized)) return 'Used to live here';
  if (HEAD_ROLE_RE.test(normalized)) return 'Head of household';
  if (SPLIT_ROLE_RE.test(normalized)) return 'Splits time';
  if (WEEKEND_ROLE_RE.test(normalized)) return 'Weekends';
  if (VISITOR_ROLE_RE.test(normalized)) return 'Visits';
  if (!normalized || LIVES_HERE_RE.test(normalized)) return 'Lives here';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isActiveHouseholdStay(role: string): boolean {
  const normalized = role.trim().toLowerCase().replace(/_/g, ' ');
  return !FORMER_ROLE_RE.test(normalized);
}

export function otherHouseholdPeople(
  org: Pick<Organization, 'members'>,
  characterId?: string | null,
  characterName?: string | null,
  isSelf = false,
): OrganizationMember[] {
  return (org.members ?? []).filter(
    (member) =>
      member.status !== 'former' &&
      !memberMatchesCharacter(member, characterId, characterName, isSelf),
  );
}

export function splitOrganizationsByHousehold<T extends CharacterOrganization>(
  organizations: T[],
): { households: T[]; groups: T[] } {
  const households: T[] = [];
  const groups: T[] = [];
  for (const org of organizations) {
    if (isHouseholdGroup(org)) households.push(org);
    else groups.push(org);
  }
  const rank = (org: T) => {
    const role = characterHouseholdRole(org).toLowerCase();
    if (HEAD_ROLE_RE.test(role)) return 0;
    if (LIVES_HERE_RE.test(role) && !FORMER_ROLE_RE.test(role)) return 1;
    if (SPLIT_ROLE_RE.test(role) || WEEKEND_ROLE_RE.test(role)) return 2;
    if (VISITOR_ROLE_RE.test(role)) return 3;
    if (FORMER_ROLE_RE.test(role)) return 4;
    return 2;
  };
  households.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { households, groups };
}

export function householdArrangementCopy(
  households: CharacterOrganization[],
  characterId?: string | null,
  characterName?: string | null,
  isSelf = false,
): string | null {
  const active = households.filter((org) =>
    isActiveHouseholdStay(characterHouseholdRole(org, characterId, characterName, isSelf)),
  );
  if (active.length < 2) return null;
  const names = active.map((org) => org.name).slice(0, 3);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(', ');
  return `More than one home — ${list}. People split time across households (divorced parents, two houses, a cousin's other side of the family).`;
}

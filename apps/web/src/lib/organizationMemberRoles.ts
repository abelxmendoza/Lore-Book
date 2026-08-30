/**
 * Shared membership roles for Character ↔ Groups linking UI.
 * These are seats/titles in the group — not the user's personal relationship
 * to the person (coworker, friend, etc. belong on the character profile).
 * Free-text custom roles are still allowed via the "Custom…" option.
 */

export const ORGANIZATION_MEMBER_ROLE_GROUPS = [
  {
    label: 'Household',
    roles: [
      'lives here',
      'splits time',
      'weekends',
      'head of household',
      'visitor',
      'former resident',
    ],
  },
  {
    label: 'Affiliation',
    roles: [
      'member',
      'employee',
      'intern',
      'contractor',
      'volunteer',
      'guest',
      'former member',
      'alumnus',
    ],
  },
  {
    label: 'Leadership',
    roles: [
      'founder',
      'co-founder',
      'owner',
      'leader',
      'manager',
      'director',
      'organizer',
      'captain',
      'coach',
      'advisor',
      'mentor',
      'president',
      'treasurer',
      'secretary',
    ],
  },
] as const;

export const ORGANIZATION_MEMBER_ROLES = ORGANIZATION_MEMBER_ROLE_GROUPS.flatMap(
  (group) => [...group.roles],
);

export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];

export const CUSTOM_ORG_MEMBER_ROLE = '__custom__';

export function resolveOrganizationMemberRolePreset(role: string): OrganizationMemberRole | null {
  const normalized = role.trim().toLowerCase().replace(/_/g, ' ');
  return (
    (ORGANIZATION_MEMBER_ROLES as readonly string[]).find(
      (preset) => preset.toLowerCase() === normalized,
    ) as OrganizationMemberRole | undefined
  ) ?? null;
}

export function isPresetOrganizationMemberRole(role: string): boolean {
  return resolveOrganizationMemberRolePreset(role) != null;
}

export function formatOrganizationMemberRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

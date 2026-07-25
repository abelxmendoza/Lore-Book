/**
 * Shared membership roles for Character ↔ Groups linking UI.
 * Free-text custom roles are still allowed via the "Custom…" option.
 */
export const ORGANIZATION_MEMBER_ROLES = [
  'member',
  'leader',
  'founder',
  'co-founder',
  'organizer',
  'captain',
  'coach',
  'manager',
  'employee',
  'coworker',
  'colleague',
  'intern',
  'contractor',
  'advisor',
  'mentor',
  'regular',
  'alumnus',
  'alumni',
  'former member',
  'guest',
  'volunteer',
  'partner',
  'owner',
  'director',
  'president',
  'treasurer',
  'secretary',
] as const;

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

/**
 * When a character is labeled with an employment seat in a group,
 * derive Info-panel Work attributes (occupation / workplace).
 */

export const EMPLOYMENT_MEMBERSHIP_ROLES = [
  'employee',
  'intern',
  'contractor',
] as const;

export type EmploymentMembershipRole = (typeof EMPLOYMENT_MEMBERSHIP_ROLES)[number];

export type MembershipWorkAttribute = {
  attributeType: 'occupation' | 'workplace' | 'company' | 'employment_status';
  attributeValue: string;
};

function normalizeMembershipRole(role: string | null | undefined): string {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

export function resolveEmploymentMembershipRole(
  role: string | null | undefined,
): EmploymentMembershipRole | null {
  const normalized = normalizeMembershipRole(role);
  return (
    (EMPLOYMENT_MEMBERSHIP_ROLES as readonly string[]).find((r) => r === normalized) as
      | EmploymentMembershipRole
      | undefined
  ) ?? null;
}

function formatOccupationLabel(role: EmploymentMembershipRole): string {
  return role.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build entity_attributes rows for Character Info → Work when membership
 * role implies employment at the organization.
 */
export function workAttributesFromEmploymentMembership(params: {
  role: string | null | undefined;
  organizationName: string;
}): MembershipWorkAttribute[] {
  const employmentRole = resolveEmploymentMembershipRole(params.role);
  const orgName = params.organizationName.trim();
  if (!employmentRole || !orgName) return [];

  return [
    {
      attributeType: 'workplace',
      attributeValue: orgName,
    },
    {
      attributeType: 'company',
      attributeValue: orgName,
    },
    {
      attributeType: 'occupation',
      attributeValue: formatOccupationLabel(employmentRole),
    },
    {
      attributeType: 'employment_status',
      attributeValue: 'employed',
    },
  ];
}

export type DemoOrganizationSummary = {
  id: string;
  name: string;
  type: 'organization';
  group_type: string;
  status: string;
  user_relationship: string;
  description: string;
};

export type DemoLocationOrganizationLink = {
  id: string;
  organization_id: string;
  location_id: string;
  location_name: string;
  visit_count: number;
  organization: DemoOrganizationSummary;
};

export const demoOrganizationOptions: DemoOrganizationSummary[] = [
  {
    id: 'mock-4',
    name: 'The Midnight Circuit',
    type: 'organization',
    group_type: 'band',
    status: 'active',
    user_relationship: 'founder',
    description: 'A creative group that rehearses and records together.',
  },
  {
    id: 'mock-9',
    name: 'Eastside BJJ',
    type: 'organization',
    group_type: 'martial_arts',
    status: 'active',
    user_relationship: 'member',
    description: 'A regular training community.',
  },
  {
    id: 'mock-11',
    name: 'Novara Systems',
    type: 'organization',
    group_type: 'company',
    status: 'active',
    user_relationship: 'former_member',
    description: 'A former workplace and professional community.',
  },
  {
    id: 'mock-12',
    name: "Tuesday Writers' Workshop",
    type: 'organization',
    group_type: 'club',
    status: 'active',
    user_relationship: 'member',
    description: 'A recurring writing and feedback group.',
  },
];

let demoLinks: DemoLocationOrganizationLink[] = [
  {
    id: 'demo-org-location-novara',
    organization_id: 'mock-11',
    location_id: 'dummy-loc-1',
    location_name: 'Novara HQ',
    visit_count: 48,
    organization: demoOrganizationOptions.find((org) => org.id === 'mock-11')!,
  },
  {
    id: 'demo-org-location-studio',
    organization_id: 'mock-4',
    location_id: 'dummy-loc-3',
    location_name: 'Home Studio',
    visit_count: 18,
    organization: demoOrganizationOptions.find((org) => org.id === 'mock-4')!,
  },
  {
    id: 'demo-org-location-coffee',
    organization_id: 'mock-12',
    location_id: 'dummy-loc-4',
    location_name: 'Ritual Coffee',
    visit_count: 12,
    organization: demoOrganizationOptions.find((org) => org.id === 'mock-12')!,
  },
  {
    id: 'demo-org-location-gym',
    organization_id: 'mock-9',
    location_id: 'dummy-loc-6',
    location_name: 'Mission Climbing Gym',
    visit_count: 9,
    organization: demoOrganizationOptions.find((org) => org.id === 'mock-9')!,
  },
];

export function getDemoLocationOrganizationLinks(locationId: string): DemoLocationOrganizationLink[] {
  return demoLinks.filter((link) => link.location_id === locationId);
}

export function getDemoOrganizationLocationLinks(organizationId: string) {
  return demoLinks
    .filter((link) => link.organization_id === organizationId)
    .map(({ organization: _organization, ...link }) => link);
}

export function linkDemoLocationOrganization(
  location: { id: string; name: string },
  organizationId: string,
): DemoLocationOrganizationLink {
  const existing = demoLinks.find(
    (link) => link.location_id === location.id && link.organization_id === organizationId,
  );
  if (existing) return existing;

  const organization = demoOrganizationOptions.find((option) => option.id === organizationId);
  if (!organization) throw new Error('Choose a group from the Groups & Organizations Book.');

  const link: DemoLocationOrganizationLink = {
    id: `demo-org-location-${location.id}-${organizationId}`,
    organization_id: organizationId,
    location_id: location.id,
    location_name: location.name,
    visit_count: 1,
    organization,
  };
  demoLinks = [link, ...demoLinks];
  return link;
}

export function unlinkDemoLocationOrganization(linkId: string): void {
  demoLinks = demoLinks.filter((link) => link.id !== linkId);
}

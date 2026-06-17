import type { GroupType } from '../components/organizations/OrganizationProfileCard';

/** Canonical G1 group types — keep in sync with DB CHECK constraints. */
export const CANONICAL_GROUP_TYPES: GroupType[] = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit',
  'family', 'household', 'martial_arts', 'scene', 'crew', 'collective', 'community',
  'institution', 'public_entity', 'brand', 'vendor', 'team', 'project', 'event_group', 'other',
];

export type OrganizationCategory =
  | 'all' | 'recent'
  | 'companies' | 'communities' | 'families' | 'households' | 'teams'
  | 'crews' | 'bands' | 'scenes'
  | 'brands' | 'vendors'
  | 'clubs' | 'nonprofits'
  | 'sports_teams' | 'public_entities';

export const ORGANIZATION_CATEGORIES: OrganizationCategory[] = [
  'all',
  'companies',
  'communities',
  'families',
  'households',
  'teams',
  'crews',
  'bands',
  'scenes',
  'brands',
  'vendors',
  'sports_teams',
  'clubs',
  'nonprofits',
  'public_entities',
  'recent',
];

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  friend_group: 'Friend Group',
  band: 'Band',
  sports_team: 'Sports Team',
  company: 'Company',
  club: 'Club',
  nonprofit: 'Nonprofit',
  family: 'Family',
  household: 'Household',
  martial_arts: 'Martial Arts',
  scene: 'Scene',
  crew: 'Crew',
  collective: 'Collective',
  community: 'Community',
  institution: 'Institution',
  public_entity: 'Public Entity',
  brand: 'Brand',
  vendor: 'Vendor',
  team: 'Team',
  project: 'Project',
  event_group: 'Event Group',
  other: 'Other',
};

/** Optional finer-grained tag stored in organization.metadata.subcategory */
export const GROUP_SUBCATEGORIES: Partial<Record<GroupType, readonly string[]>> = {
  brand: ['consumer', 'luxury', 'retail', 'food_beverage', 'tech', 'media', 'fashion', 'other'],
  vendor: ['supplier', 'contractor', 'agency', 'saas', 'freelancer', 'retail', 'services', 'other'],
  company: ['startup', 'enterprise', 'agency', 'staffing', 'consulting', 'other'],
  institution: ['university', 'school', 'hospital', 'government', 'other'],
  club: ['hobby', 'professional', 'social', 'other'],
  nonprofit: ['charity', 'foundation', 'advocacy', 'other'],
};

export function groupTypeMatchesCategory(groupType: GroupType, category: OrganizationCategory): boolean {
  if (category === 'all') return true;
  switch (category) {
    case 'crews':
      return groupType === 'friend_group' || groupType === 'crew';
    case 'bands':
      return groupType === 'band';
    case 'scenes':
      return groupType === 'scene';
    case 'communities':
      return groupType === 'community';
    case 'companies':
      return groupType === 'company';
    case 'families':
      return groupType === 'family';
    case 'households':
      return groupType === 'household';
    case 'teams':
      return groupType === 'team' || groupType === 'sports_team' || groupType === 'martial_arts';
    case 'brands':
      return groupType === 'brand';
    case 'vendors':
      return groupType === 'vendor';
    case 'clubs':
      return groupType === 'club' || groupType === 'collective';
    case 'sports_teams':
      return groupType === 'sports_team' || groupType === 'martial_arts';
    case 'nonprofits':
      return groupType === 'nonprofit';
    case 'public_entities':
      return groupType === 'public_entity' || groupType === 'institution';
    case 'recent':
      return true;
    default:
      return true;
  }
}

export function formatSubcategory(value: string): string {
  return value.replace(/_/g, ' ');
}

/**
 * Social group taxonomy — mirrors server groupIntelligence for UI filtering
 * and household/family drill-down in the Organizations Book.
 */
import type { Organization } from '../components/organizations/OrganizationProfileCard';

export type SocialGroupCategory =
  | 'COMPANY' | 'INSTITUTION' | 'COMMUNITY' | 'SCENE' | 'FAMILY' | 'HOUSEHOLD'
  | 'TEAM' | 'BAND' | 'EVENT_GROUP' | 'FRIEND_GROUP' | 'PROJECT' | 'UNKNOWN';

type SocialOrg = Pick<Organization, 'name' | 'group_type' | 'metadata'> & {
  social_category?: string | null;
  parent_group_id?: string | null;
};

const HOUSEHOLD_RE = /\b(household|family\s+home)\b/i;
const FAMILY_RE = /\b(my\s+family|the\s+family|our\s+family|^family$)\b/i;
const EVENT_GROUP_RE = /\b(party|reunion|gathering|meetup|wedding|graduation)\b/i;

export function getSocialCategory(org: SocialOrg): SocialGroupCategory {
  if (org.social_category) return org.social_category as SocialGroupCategory;
  const sc = (org.metadata?.social_classification as { category?: string } | undefined)?.category;
  if (sc) return sc as SocialGroupCategory;
  const gt = org.group_type;
  const map: Partial<Record<string, SocialGroupCategory>> = {
    company: 'COMPANY', institution: 'INSTITUTION', community: 'COMMUNITY', scene: 'SCENE',
    family: 'FAMILY', household: 'HOUSEHOLD', band: 'BAND', sports_team: 'TEAM', team: 'TEAM',
    friend_group: 'FRIEND_GROUP', project: 'PROJECT', event_group: 'EVENT_GROUP',
  };
  if (map[gt]) return map[gt]!;
  if (HOUSEHOLD_RE.test(org.name)) return 'HOUSEHOLD';
  if (FAMILY_RE.test(org.name)) return 'FAMILY';
  return 'UNKNOWN';
}

export function isHouseholdGroup(org: SocialOrg): boolean {
  return getSocialCategory(org) === 'HOUSEHOLD' || org.group_type === 'household' || HOUSEHOLD_RE.test(org.name);
}

export function isFamilyGroup(org: SocialOrg): boolean {
  return getSocialCategory(org) === 'FAMILY' || (org.group_type === 'family' && !isHouseholdGroup(org));
}

export function isCommunityGroup(org: SocialOrg): boolean {
  const cat = getSocialCategory(org);
  return cat === 'COMMUNITY' || cat === 'SCENE' || org.group_type === 'community' || org.group_type === 'scene';
}

export function isCompanyGroup(org: SocialOrg): boolean {
  return getSocialCategory(org) === 'COMPANY' || org.group_type === 'company';
}

export function isEventGroup(org: SocialOrg): boolean {
  return getSocialCategory(org) === 'EVENT_GROUP' || EVENT_GROUP_RE.test(org.name);
}

/** Top-level org cards — households nest under families, event groups hidden. */
export function isTopLevelGroup(org: SocialOrg): boolean {
  if (org.parent_group_id) return false;
  const meta = org.metadata ?? {};
  if (meta.parent_group_id) return false;
  if (isHouseholdGroup(org) && !org.parent_group_id) {
    // Show households only in Households tab, not in All — still top-level within that tab
    return true;
  }
  return !isEventGroup(org);
}

export function computeChildHouseholds(parent: Organization, all: Organization[]): Organization[] {
  const parentId = parent.id;
  const parentKey = parent.name.trim().toLowerCase();
  return all
    .filter((org) => {
      if (org.id === parent.id) return false;
      if (org.parent_group_id === parentId) return true;
      const meta = org.metadata ?? {};
      if (meta.parent_group_id === parentId) return true;
      if (typeof meta.parent_family_name === 'string' && meta.parent_family_name.toLowerCase() === parentKey) return true;
      return isHouseholdGroup(org) && !org.parent_group_id && /\bfamily\b/i.test(parent.name) && /\b(household|home)\b/i.test(org.name);
    })
    .sort((a, b) => b.usage_count - a.usage_count);
}

export function getLinkedVenueNames(org: Organization): string[] {
  const meta = org.metadata ?? {};
  if (Array.isArray(meta.linked_venue_names)) return meta.linked_venue_names as string[];
  if (Array.isArray(org.locations)) return org.locations.map((l) => l.location_name);
  return [];
}

export const SOCIAL_CATEGORY_META: Record<SocialGroupCategory, { label: string; icon: string; color: string }> = {
  COMPANY: { label: 'Company', icon: '🏢', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  INSTITUTION: { label: 'Institution', icon: '🎓', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  COMMUNITY: { label: 'Community', icon: '🌐', color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  SCENE: { label: 'Scene', icon: '🎭', color: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' },
  FAMILY: { label: 'Family', icon: '👨‍👩‍👧', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  HOUSEHOLD: { label: 'Household', icon: '🏠', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  TEAM: { label: 'Team', icon: '⚽', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  BAND: { label: 'Band', icon: '🎸', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  EVENT_GROUP: { label: 'Event Group', icon: '🎉', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  FRIEND_GROUP: { label: 'Friend Group', icon: '👥', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  PROJECT: { label: 'Project', icon: '📋', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  UNKNOWN: { label: 'Group', icon: '📌', color: 'bg-white/10 text-white/60 border-white/20' },
};

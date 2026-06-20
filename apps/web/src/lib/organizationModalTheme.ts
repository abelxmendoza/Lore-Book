import type { Organization } from '../components/organizations/OrganizationProfileCard';
import { getSocialCategory } from './groupTaxonomy';

export function getOrgTypeColor(type: string): string {
  const colors: Record<string, string> = {
    friend_group: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    company: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    sports_team: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    club: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    nonprofit: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    affiliation: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    family: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    household: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    community: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    band: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    other: 'bg-white/10 text-white/55 border-white/20',
  };
  return colors[type] ?? colors.other;
}

export function getOrgTypeLabel(type: string): string {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function getRelationshipBadgeClass(rel?: string): string {
  if (!rel) return 'bg-white/10 text-white/50 border-white/20';
  if (['founder', 'leader'].includes(rel)) return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  if (rel === 'member') return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  if (rel === 'former_member' || rel === 'alumnus') return 'bg-white/10 text-white/45 border-white/20';
  if (['adjacent', 'collaborator'].includes(rel)) return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
  if (rel === 'fan') return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
  return 'bg-white/10 text-white/50 border-white/20';
}

export function formatRelationship(rel?: string): string {
  if (!rel) return 'Unknown';
  return rel.replace(/_/g, ' ');
}

export type OrgCategoryTheme = {
  accent: string;
  border: string;
  bg: string;
  iconBg: string;
};

export function getOrgCategoryTheme(org: Organization): OrgCategoryTheme {
  const cat = getSocialCategory(org);
  const map: Record<string, OrgCategoryTheme> = {
    FAMILY: {
      accent: 'text-rose-300',
      border: 'border-rose-500/25',
      bg: 'from-rose-950/40 via-black/50 to-black/60',
      iconBg: 'bg-rose-500/20 border-rose-500/35',
    },
    HOUSEHOLD: {
      accent: 'text-purple-300',
      border: 'border-purple-500/25',
      bg: 'from-purple-950/40 via-black/50 to-black/60',
      iconBg: 'bg-purple-500/20 border-purple-500/35',
    },
    COMPANY: {
      accent: 'text-blue-300',
      border: 'border-blue-500/25',
      bg: 'from-blue-950/40 via-black/50 to-black/60',
      iconBg: 'bg-blue-500/20 border-blue-500/35',
    },
    COMMUNITY: {
      accent: 'text-violet-300',
      border: 'border-violet-500/25',
      bg: 'from-violet-950/40 via-black/50 to-black/60',
      iconBg: 'bg-violet-500/20 border-violet-500/35',
    },
  };
  return map[cat] ?? {
    accent: 'text-primary',
    border: 'border-primary/25',
    bg: 'from-primary/10 via-black/50 to-black/60',
    iconBg: 'bg-primary/20 border-primary/35',
  };
}

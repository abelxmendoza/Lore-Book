import {
  Building2, Users, ChevronRight, Hash, BookOpen, CalendarDays,
  TrendingUp, TrendingDown, Minus, Star, Award, Heart,
  Music, Shield, Zap, Globe, GraduationCap, Layers,
  Calendar, MapPin, Tag, Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import { readOrganizationWorld, importanceStars } from '../../lib/organizationLore';

// ── G1 canonical types ────────────────────────────────────────────────
export type GroupType =
  | 'friend_group' | 'band' | 'sports_team' | 'company' | 'club' | 'nonprofit'
  | 'family' | 'household' | 'martial_arts' | 'scene' | 'crew' | 'collective'
  | 'community' | 'institution' | 'public_entity' | 'brand' | 'vendor'
  | 'team' | 'project' | 'event_group' | 'other';

export type MembershipModel = 'strict' | 'fuzzy' | 'none';

export type UserRelationship =
  | 'founder' | 'leader' | 'member' | 'former_member' | 'collaborator'
  | 'adjacent' | 'fan' | 'aware_of' | 'referenced' | 'alumnus';

export type OrgRelationshipType =
  | 'part_of' | 'affiliated_with' | 'rival_of' | 'spawned_from'
  | 'collaborated_with' | 'succeeded_by' | 'merged_with';

export type OrganizationRelationship = {
  id: string;
  user_id: string;
  from_org_id: string;
  to_org_id: string;
  relationship_type: OrgRelationshipType;
  notes?: string;
  created_at: string;
};

export type OrganizationMember = {
  id: string;
  character_id?: string;
  character_name: string;
  role?: string;
  joined_date?: string;
  left_at?: string;
  status: 'active' | 'former' | 'honorary';
  notes?: string;
};

export type OrganizationStory = {
  id: string;
  memory_id?: string;
  title: string;
  summary: string;
  date: string;
  related_members?: string[];
};

export type OrganizationEvent = {
  id: string;
  event_id?: string;
  title: string;
  date: string;
  type: 'meeting' | 'game' | 'social' | 'work' | 'other';
};

export type OrganizationLocation = {
  id: string;
  location_id?: string;
  location_name: string;
  visit_count: number;
  last_visited?: string;
};

export type Organization = {
  id: string;
  name: string;
  aliases: string[];

  // Legacy type column (kept for backward compat)
  type: 'friend_group' | 'company' | 'sports_team' | 'club' | 'nonprofit' | 'affiliation' | 'family' | 'martial_arts' | 'other';

  // G1 canonical group model
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity: boolean;
  founded_year?: number;
  dissolved_year?: number;

  // Family-specific metadata
  generations?: number;
  family_branches?: string[];
  // Hierarchy metadata
  hierarchy_system_id?: string;
  hierarchy_enabled?: boolean;

  description?: string;
  location?: string;
  founded_date?: string;
  status: 'active' | 'inactive' | 'dissolved';

  // Rich metadata
  members?: OrganizationMember[];
  stories?: OrganizationStory[];
  events?: OrganizationEvent[];
  locations?: OrganizationLocation[];

  // Stats
  member_count: number;
  usage_count: number;
  confidence: number;
  last_seen: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  root_type?: string | null;
  social_category?: string | null;
  social_subcategory?: string | null;
  parent_group_id?: string | null;

  // Rich "personality" profile (mission, culture, structure, reputation, …).
  profile?: import('../../lib/organizationProfile').OrganizationProfile;

  // Analytics
  analytics?: {
    user_involvement_score: number;
    user_ranking: number;
    user_role_importance: number;
    relevance_score: number;
    priority_score: number;
    importance_score: number;
    value_score: number;
    group_influence_on_user: number;
    user_influence_over_group: number;
    cohesion_score: number;
    activity_level: number;
    engagement_score: number;
    recency_score: number;
    frequency_score: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
  };
};

type OrganizationProfileCardProps = {
  organization: Organization;
  onClick?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
};

// ── Per-type visual config ────────────────────────────────────────────
type VisualConfig = {
  grad: string;
  icon: React.ElementType;
  iconCls: string;
};

const TYPE_VISUALS: Record<GroupType, VisualConfig> = {
  friend_group: {
    grad: 'from-purple-500/20 via-purple-600/20 to-purple-500/20',
    icon: Users,
    iconCls: 'text-purple-400/60 group-hover:text-purple-400',
  },
  crew: {
    grad: 'from-orange-500/20 via-amber-600/20 to-orange-500/20',
    icon: Users,
    iconCls: 'text-orange-400/60 group-hover:text-orange-400',
  },
  band: {
    grad: 'from-violet-500/20 via-indigo-600/20 to-violet-500/20',
    icon: Music,
    iconCls: 'text-violet-400/60 group-hover:text-violet-400',
  },
  scene: {
    grad: 'from-pink-500/20 via-fuchsia-600/20 to-pink-500/20',
    icon: Zap,
    iconCls: 'text-pink-400/60 group-hover:text-pink-400',
  },
  collective: {
    grad: 'from-indigo-500/20 via-violet-600/20 to-indigo-500/20',
    icon: Layers,
    iconCls: 'text-indigo-400/60 group-hover:text-indigo-400',
  },
  sports_team: {
    grad: 'from-cyan-500/20 via-blue-600/20 to-cyan-500/20',
    icon: Users,
    iconCls: 'text-cyan-400/60 group-hover:text-cyan-400',
  },
  company: {
    grad: 'from-amber-500/20 via-yellow-600/20 to-amber-500/20',
    icon: Building2,
    iconCls: 'text-amber-400/60 group-hover:text-amber-400',
  },
  club: {
    grad: 'from-emerald-500/20 via-green-600/20 to-emerald-500/20',
    icon: Star,
    iconCls: 'text-emerald-400/60 group-hover:text-emerald-400',
  },
  nonprofit: {
    grad: 'from-teal-500/20 via-cyan-600/20 to-teal-500/20',
    icon: Heart,
    iconCls: 'text-teal-400/60 group-hover:text-teal-400',
  },
  family: {
    grad: 'from-rose-500/20 via-pink-600/20 to-rose-500/20',
    icon: Heart,
    iconCls: 'text-rose-400/60 group-hover:text-rose-400',
  },
  martial_arts: {
    grad: 'from-red-500/20 via-orange-600/20 to-red-500/20',
    icon: Shield,
    iconCls: 'text-orange-400/60 group-hover:text-orange-400',
  },
  institution: {
    grad: 'from-slate-500/20 via-blue-600/20 to-slate-500/20',
    icon: GraduationCap,
    iconCls: 'text-slate-400/60 group-hover:text-slate-300',
  },
  public_entity: {
    grad: 'from-yellow-500/20 via-amber-600/20 to-yellow-500/20',
    icon: Globe,
    iconCls: 'text-yellow-400/60 group-hover:text-yellow-400',
  },
  brand: {
    grad: 'from-fuchsia-500/20 via-pink-600/20 to-fuchsia-500/20',
    icon: Tag,
    iconCls: 'text-fuchsia-400/60 group-hover:text-fuchsia-400',
  },
  vendor: {
    grad: 'from-lime-500/20 via-green-600/20 to-lime-500/20',
    icon: Truck,
    iconCls: 'text-lime-400/60 group-hover:text-lime-400',
  },
  community: {
    grad: 'from-teal-500/20 via-emerald-600/20 to-teal-500/20',
    icon: Users,
    iconCls: 'text-teal-400/60 group-hover:text-teal-400',
  },
  other: {
    grad: 'from-gray-500/20 via-gray-600/20 to-gray-500/20',
    icon: Building2,
    iconCls: 'text-gray-400/60 group-hover:text-gray-400',
  },
};

// ── Relationship tier display ─────────────────────────────────────────
const REL_LABELS: Record<UserRelationship, string> = {
  founder: 'Founder',
  leader: 'Leader',
  member: 'Member',
  former_member: 'Former member',
  collaborator: 'Collaborator',
  adjacent: 'Adjacent',
  fan: 'Fan',
  aware_of: 'Aware of',
  referenced: 'Referenced',
  alumnus: 'Alumnus',
};

function relBadgeCls(rel: UserRelationship): string {
  if (rel === 'founder') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (rel === 'leader')  return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (rel === 'former_member' || rel === 'alumnus') return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (rel === 'collaborator' || rel === 'adjacent') return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
  if (rel === 'fan')    return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
  if (rel === 'aware_of' || rel === 'referenced') return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  return 'bg-white/10 text-white/40 border-white/20';
}

export const OrganizationProfileCard = ({ organization, onClick, selectionMode, selected }: OrganizationProfileCardProps) => {
  const gt = organization.group_type ?? 'other';
  const visual = TYPE_VISUALS[gt] ?? TYPE_VISUALS.other;
  const Icon = visual.icon;
  const rel = organization.user_relationship;

  const formatDate = (dateString: string) => {
    try { return format(parseISO(dateString), 'MMM d, yyyy'); }
    catch { return dateString; }
  };

  const isFamily = gt === 'family';
  const isPublic = organization.is_public_entity;
  const isFuzzy  = organization.membership_model === 'fuzzy';
  const isFormer = rel === 'former_member' || rel === 'alumnus';
  const isObserver = rel === 'fan' || rel === 'aware_of' || rel === 'referenced';

  // World/lore layer — archetype nickname, importance, and the "why it matters" line.
  const world = readOrganizationWorld(organization);
  const stars = importanceStars(organization.analytics?.importance_score ?? world.influence.impactScore);
  const keyPeople = (organization.members ?? [])
    .map((m) => m.character_name)
    .filter(Boolean)
    .slice(0, 4);
  const storyLine =
    organization.profile?.mission || organization.description || world.lore.roleInStory;

  return (
    <Card
      className={`group relative cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 sm:hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 overflow-hidden flex flex-col min-h-0 ${isFormer ? 'opacity-75' : ''} ${
        selected
          ? 'border-purple-500/50 ring-1 ring-purple-500/40 bg-purple-500/10'
          : 'border-border/50'
      }`}
      onClick={onClick}
    >
      {selectionMode && (
        <span
          className={`absolute top-2 right-2 z-20 w-5 h-5 rounded border text-[10px] flex items-center justify-center ${
            selected ? 'bg-purple-500 border-purple-400 text-black' : 'border-white/25 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
      {/* Header — color and icon vary by group type */}
      <div className={`relative h-12 sm:h-16 bg-gradient-to-br ${visual.grad} flex items-center justify-center flex-shrink-0`}>
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <Icon className={`h-6 w-6 sm:h-10 sm:w-10 ${visual.iconCls} transition-colors relative z-10`} />

        {/* Top-right: analytics + confidence */}
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 items-center gap-1 hidden sm:flex">
          {organization.analytics && !isObserver && (
            <>
              <Badge
                variant="outline"
                className={`${organization.analytics.importance_score >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : organization.analytics.importance_score >= 40 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
              >
                {organization.analytics.importance_score >= 70 ? <Star className="h-2.5 w-2.5" /> : organization.analytics.importance_score >= 40 ? <Award className="h-2.5 w-2.5" /> : null}
                {organization.analytics.importance_score}
              </Badge>
              {organization.analytics.trend === 'increasing' && <TrendingUp className="h-3 w-3 text-green-400" />}
              {organization.analytics.trend === 'decreasing' && <TrendingDown className="h-3 w-3 text-red-400" />}
              {organization.analytics.trend === 'stable'     && <Minus className="h-3 w-3 text-gray-400" />}
            </>
          )}
          {/* Confidence — skip for public/reference-only orgs */}
          {!isPublic && !isObserver && (
            <Badge
              variant="outline"
              className={`${organization.confidence >= 0.7 ? 'bg-green-500/20 text-green-400 border-green-500/30' : organization.confidence >= 0.4 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'} text-[10px] px-1.5 py-0.5`}
            >
              {organization.confidence >= 0.7 ? 'High' : organization.confidence >= 0.4 ? 'Med' : 'Low'}
            </Badge>
          )}
          {isPublic && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Public
            </Badge>
          )}
        </div>

        {/* Fuzzy/scene indicator */}
        {isFuzzy && (
          <div className="absolute bottom-1 left-2 hidden sm:block">
            <span className="text-[9px] text-white/40 uppercase tracking-wider">participatory</span>
          </div>
        )}
      </div>

      <CardHeader className="pb-0 sm:pb-1.5 pt-1.5 sm:pt-2.5 px-2 sm:px-4 flex-1 min-h-0 flex flex-col justify-center">
        <div className="flex items-start justify-between gap-1 sm:gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className="text-xs sm:text-base font-semibold text-white line-clamp-2 sm:truncate group-hover:text-primary transition-colors break-words"
              title={organization.name}
            >
              {organization.name}
            </h3>

            {/* Archetype nickname + importance — "the world node" identity */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-violet-300/70 italic truncate" title={world.archetype.essence}>
                "{world.archetype.nickname}"
              </span>
              {!isObserver && (
                <span className="text-[9px] leading-none text-amber-300 shrink-0" aria-label={`Importance ${stars} of 5`}>
                  {'★'.repeat(stars)}<span className="text-white/15">{'★'.repeat(5 - stars)}</span>
                </span>
              )}
            </div>

            {/* Group type + relationship badges — visible on all breakpoints */}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <p className="text-[10px] text-white/50 truncate capitalize">
                {gt.replace(/_/g, ' ')}
              </p>
              {rel && rel !== 'member' && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${relBadgeCls(rel)}`}>
                  {REL_LABELS[rel]}
                </span>
              )}
              {(organization.hierarchy_enabled || organization.metadata?.hierarchy_enabled) && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/25">
                  hierarchy
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 hidden sm:block" />
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0 px-2 sm:px-4 pb-2 sm:pb-3 flex-shrink-0">
        {/* Row 1 — members or generations for family */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-white/70">
          {isFamily ? (
            <>
              <Heart className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-400 flex-shrink-0" />
              <span>{organization.generations ?? '-'} generations</span>
            </>
          ) : isPublic ? (
            <>
              <Globe className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-yellow-400 flex-shrink-0" />
              <span>Public entity</span>
            </>
          ) : (
            <>
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary flex-shrink-0" />
              <span>{organization.member_count ?? 0} {(organization.member_count ?? 0) === 1 ? 'member' : 'members'}</span>
            </>
          )}
          {!isPublic && (
            <>
              <span className="text-white/40">•</span>
              <span className="inline-flex items-center gap-0.5">
                <Hash className="h-2.5 w-2.5" />
                {organization.usage_count}
              </span>
            </>
          )}
        </div>

        {/* Mobile — importance score (badges already shown in header row) */}
        <div className="flex items-center gap-1.5 text-[10px] text-white/50 sm:hidden">
          {organization.analytics && !isObserver && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                organization.analytics.importance_score >= 70
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : organization.analytics.importance_score >= 40
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              }`}
            >
              {organization.analytics.importance_score >= 70 && <Star className="h-2 w-2" />}
              Score {organization.analytics.importance_score}
            </span>
          )}
          {isPublic && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              Public
            </span>
          )}
        </div>

        {/* Key people — "who's involved" */}
        {!isFamily && !isPublic && keyPeople.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-white/55 min-w-0">
            <Users className="h-3 w-3 text-primary/70 flex-shrink-0" />
            <span className="truncate">{keyPeople.join(' • ')}</span>
          </div>
        )}

        {/* Story line — "why it matters", always visible */}
        {storyLine && (
          <p className="text-[11px] sm:text-xs text-white/60 line-clamp-2 leading-snug">
            {storyLine}
          </p>
        )}

        {/* Compact stat pills — mobile + desktop */}
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          {organization.stories && organization.stories.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary/90">
              <BookOpen className="h-2.5 w-2.5" />
              {organization.stories.length}
            </span>
          )}
          {organization.events && organization.events.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">
              <CalendarDays className="h-2.5 w-2.5" />
              {organization.events.length}
            </span>
          )}
          {organization.founded_year && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-white/50">
              <Calendar className="h-2.5 w-2.5" />
              {organization.founded_year}
            </span>
          )}
          {organization.location && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-white/50 max-w-[120px] truncate">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {organization.location}
            </span>
          )}
          {organization.profile?.values && organization.profile.values.length > 0 && (
            organization.profile.values.slice(0, 2).map((v) => (
              <span
                key={v}
                className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/45 truncate max-w-[80px]"
              >
                {v}
              </span>
            ))
          )}
        </div>

        {/* Extended metadata — desktop only */}
        <div className="flex-wrap gap-2 text-[10px] text-white/50 hidden sm:flex">
          {organization.analytics && !isObserver && (
            <>
              <div className="flex items-center gap-1">
                <Award className="h-2.5 w-2.5 text-amber-400" />
                <span className="text-amber-400">Rank #{organization.analytics.user_ranking}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-2.5 w-2.5" />
                <span>{organization.analytics.user_involvement_score}% involved</span>
              </div>
            </>
          )}
          {organization.analytics && isObserver && (
            <div className="flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5 text-pink-400" />
              <span className="text-pink-400">{organization.analytics.group_influence_on_user}% cultural influence</span>
            </div>
          )}
          {organization.founded_year && (
            <div className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              <span>Est. {organization.founded_year}</span>
            </div>
          )}
          {!organization.founded_year && (
            <div className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              <span>Last seen: {formatDate(organization.last_seen)}</span>
            </div>
          )}
          {organization.stories && organization.stories.length > 0 && (
            <div className="flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" />
              <span>{organization.stories.length} {organization.stories.length === 1 ? 'story' : 'stories'}</span>
            </div>
          )}
          {organization.events && organization.events.length > 0 && (
            <div className="flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" />
              <span>{organization.events.length} {organization.events.length === 1 ? 'event' : 'events'}</span>
            </div>
          )}
          {organization.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              <span className="truncate max-w-[100px]">{organization.location}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

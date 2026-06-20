import { Building2, MessageSquare, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { Organization } from './OrganizationProfileCard';
import {
  formatRelationship,
  getOrgCategoryTheme,
  getOrgTypeColor,
  getOrgTypeLabel,
  getRelationshipBadgeClass,
} from '../../lib/organizationModalTheme';
import { computeInfluenceScore } from '../../lib/organizationProfile';
import { readOrganizationWorld, importanceStars } from '../../lib/organizationLore';
import { cn } from '../../lib/cn';

function formatSince(org: Organization): string | null {
  if (org.founded_date) {
    const d = new Date(org.founded_date);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (org.founded_year) return String(org.founded_year);
  if (org.created_at) {
    const d = new Date(org.created_at);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return null;
}

type Props = {
  organization: Organization;
  memberCount: number;
  onClose: () => void;
  onOpenChat: () => void;
};

export function OrganizationModalHeader({ organization, memberCount, onClose, onOpenChat }: Props) {
  const theme = getOrgCategoryTheme(organization);
  const influence = computeInfluenceScore({
    analyticsInfluence: organization.analytics?.group_influence_on_user,
    memberCount: organization.member_count ?? memberCount,
    usageCount: organization.usage_count,
    userRelationship: organization.user_relationship,
  });
  const world = readOrganizationWorld(organization);
  const stars = importanceStars(organization.analytics?.importance_score ?? world.influence.impactScore);
  const since = formatSince(organization);

  return (
    <div
      className={cn(
        'flex-shrink-0 border-b border-white/8 bg-gradient-to-br px-3 py-2.5 sm:px-5 sm:py-4',
        theme.bg
      )}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className={cn('shrink-0 rounded-xl border p-2 sm:p-2.5', theme.iconBg)}>
          <Building2 className={cn('h-4 w-4 sm:h-5 sm:w-5', theme.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-white leading-tight truncate pr-1">
                {organization.name}
              </h2>
              <p className="text-[11px] sm:text-xs text-violet-200/70 italic truncate">
                "{world.archetype.nickname}" · {world.archetype.essence}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="shrink-0 h-8 w-8 p-0 -mr-1">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', getOrgTypeColor(organization.type))}>
              {getOrgTypeLabel(organization.group_type ?? organization.type)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0',
                organization.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/10 text-white/45 border-white/20'
              )}
            >
              {organization.status === 'active' ? 'Active' : organization.status}
            </Badge>
            {organization.user_relationship && (
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 capitalize', getRelationshipBadgeClass(organization.user_relationship))}>
                {formatRelationship(organization.user_relationship)}
              </Badge>
            )}
            <span className="inline-flex items-center text-amber-300 text-[11px] leading-none" title={`Importance: ${stars} of 5`} aria-label={`Importance ${stars} of 5`}>
              {'★'.repeat(stars)}<span className="text-white/20">{'★'.repeat(5 - stars)}</span>
            </span>
            {since && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 text-white/45 border-white/15">
                Since {since}
              </Badge>
            )}
          </div>
          {organization.description && (
            <p className="mt-1.5 text-xs sm:text-sm text-white/55 line-clamp-2 leading-snug">{organization.description}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-stretch gap-2">
        <div className="flex flex-1 min-w-0 gap-1.5">
          <StatPill label="Members" value={String(memberCount)} />
          <StatPill label="Influence" value={`${influence}`} suffix="/100" />
          {organization.analytics?.user_involvement_score != null && (
            <StatPill label="Involved" value={`${organization.analytics.user_involvement_score}%`} className="hidden min-[400px]:flex" />
          )}
        </div>
        <button
          type="button"
          onClick={onOpenChat}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-primary/30 touch-manipulation"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden xs:inline sm:inline">Chat</span>
        </button>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  suffix,
  className,
}: {
  label: string;
  value: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex-1 min-w-0 rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-center',
        className
      )}
    >
      <p className="text-[9px] uppercase tracking-wide text-white/35 truncate">{label}</p>
      <p className="text-sm font-bold tabular-nums text-white leading-none mt-0.5">
        {value}
        {suffix && <span className="text-[10px] font-normal text-white/35">{suffix}</span>}
      </p>
    </div>
  );
}

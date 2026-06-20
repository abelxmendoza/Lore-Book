import { Building2, Users, Home, MapPin, CalendarDays, TreePine, Briefcase, Globe, ChevronRight } from 'lucide-react';
import type { Organization } from './OrganizationProfileCard';
import {
  computeChildHouseholds,
  getLinkedVenueNames,
  getSocialCategory,
  isCommunityGroup,
  isCompanyGroup,
  isFamilyGroup,
  isHouseholdGroup,
  SOCIAL_CATEGORY_META,
} from '../../lib/groupTaxonomy';
import { cn } from '../../lib/cn';

type Props = {
  organization: Organization;
  allOrganizations: Organization[];
  onSelectOrganization?: (org: Organization) => void;
  onOpenMembersTab?: () => void;
  onOpenLocationsTab?: () => void;
  onOpenTimelineTab?: () => void;
  onOpenFamilyTab?: () => void;
  compact?: boolean;
};

export const GroupDetailPanel = ({
  organization,
  allOrganizations,
  onSelectOrganization,
  onOpenMembersTab,
  onOpenLocationsTab,
  onOpenTimelineTab,
  onOpenFamilyTab,
  compact = false,
}: Props) => {
  const category = getSocialCategory(organization);
  const meta = SOCIAL_CATEGORY_META[category] ?? SOCIAL_CATEGORY_META.UNKNOWN;
  const isFamily = isFamilyGroup(organization);
  const isCommunity = isCommunityGroup(organization);
  const isCompany = isCompanyGroup(organization);
  const isHousehold = isHouseholdGroup(organization);

  if (!isFamily && !isCommunity && !isCompany && !isHousehold) return null;

  const households = isFamily ? computeChildHouseholds(organization, allOrganizations) : [];
  const venues = isCommunity ? getLinkedVenueNames(organization) : [];
  const members = organization.members ?? [];
  const parentFamily = organization.parent_group_id
    ? allOrganizations.find((o) => o.id === organization.parent_group_id)
    : undefined;

  const shellClass = cn(
    'rounded-xl border space-y-2.5',
    compact ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4 space-y-3 sm:space-y-4',
    isFamily && 'bg-rose-500/5 border-rose-500/20',
    isHousehold && 'bg-purple-500/5 border-purple-500/20',
    isCommunity && 'bg-violet-500/5 border-violet-500/20',
    isCompany && 'bg-blue-500/5 border-blue-500/20'
  );

  const title = isFamily ? 'Family' : isHousehold ? 'Household' : isCommunity ? 'Community' : 'Company';

  if (compact) {
    return (
      <div className={shellClass}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isFamily ? <TreePine className="h-3.5 w-3.5 text-rose-300 shrink-0" /> : isHousehold ? <Home className="h-3.5 w-3.5 text-purple-300 shrink-0" /> : isCommunity ? <Globe className="h-3.5 w-3.5 text-violet-300 shrink-0" /> : <Building2 className="h-3.5 w-3.5 text-blue-300 shrink-0" />}
            <span className="text-xs font-semibold text-white truncate">{title}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${meta.color}`}>{meta.label}</span>
          </div>
        </div>

        {parentFamily && onSelectOrganization && (
          <p className="text-[11px] text-white/50">
            Part of{' '}
            <button type="button" onClick={() => onSelectOrganization(parentFamily)} className="text-rose-300 font-medium">
              {parentFamily.name}
            </button>
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {isFamily && households.slice(0, 4).map((hh) => (
            <button
              key={hh.id}
              type="button"
              onClick={() => onSelectOrganization?.(hh)}
              className="text-[10px] px-2 py-1 rounded-lg bg-black/35 border border-white/10 text-white/70"
            >
              🏠 {hh.name}
            </button>
          ))}
          {isCommunity && (venues.length > 0 ? venues : (organization.locations ?? []).map((l) => l.location_name)).slice(0, 5).map((name) => (
            <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-200">
              {name}
            </span>
          ))}
          {isCompany && onOpenTimelineTab && (
            <button type="button" onClick={onOpenTimelineTab} className="text-[10px] px-2 py-1 rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-200 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Timeline
            </button>
          )}
          {isFamily && onOpenFamilyTab && (
            <button type="button" onClick={onOpenFamilyTab} className="text-[10px] px-2 py-1 rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-200">
              Family tree
            </button>
          )}
          {members.length > 0 && onOpenMembersTab && (
            <button type="button" onClick={onOpenMembersTab} className="text-[10px] text-teal-300/90 flex items-center gap-0.5 ml-auto">
              {members.length} members <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="flex items-center gap-2 flex-wrap">
        {isFamily ? <TreePine className="h-4 w-4 text-rose-300" /> : isHousehold ? <Home className="h-4 w-4 text-purple-300" /> : isCommunity ? <Globe className="h-4 w-4 text-violet-300" /> : <Building2 className="h-4 w-4 text-blue-300" />}
        <h3 className="text-sm font-semibold text-white">{title} details</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {parentFamily && onSelectOrganization && (
        <p className="text-xs text-white/50 flex items-center gap-1.5">
          <Home className="h-3 w-3" />
          Part of
          <button type="button" onClick={() => onSelectOrganization(parentFamily)} className="text-rose-300 hover:underline font-medium">
            {parentFamily.name}
          </button>
        </p>
      )}

      <section>
        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {isCompany ? 'Employees & contacts' : 'Members'} ({members.length})
        </p>
        {members.length === 0 ? (
          <p className="text-xs text-white/30 italic">No members linked yet.</p>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-1.5 sm:gap-2">
            {members.slice(0, 12).map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/8 px-2.5 sm:px-3 py-1.5 sm:py-2">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/70">
                  {m.character_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{m.character_name}</p>
                  {m.role && <p className="text-[10px] text-white/40 capitalize">{m.role}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {onOpenMembersTab && members.length > 0 && (
          <button type="button" onClick={onOpenMembersTab} className="mt-2 text-[11px] text-teal-300/80 hover:text-teal-200">
            View all members →
          </button>
        )}
      </section>

      {isFamily && (
        <>
          <section>
            <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
              <Home className="h-3 w-3" />
              Households ({households.length})
            </p>
            {households.length === 0 ? (
              <p className="text-xs text-white/30 italic">No nested households yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {households.map((hh) => (
                  <button
                    key={hh.id}
                    type="button"
                    onClick={() => onSelectOrganization?.(hh)}
                    disabled={!onSelectOrganization}
                    className="text-xs px-3 py-2 rounded-lg bg-black/35 border border-white/10 text-white/75 hover:border-purple-500/40"
                  >
                    🏠 {hh.name}
                  </button>
                ))}
              </div>
            )}
          </section>
          {onOpenFamilyTab && (
            <button type="button" onClick={onOpenFamilyTab} className="w-full text-xs py-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-200/80">
              Open family tree →
            </button>
          )}
        </>
      )}

      {isCommunity && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            Venues & places
          </p>
          <div className="flex flex-wrap gap-2">
            {(venues.length > 0 ? venues : (organization.locations ?? []).map((l) => l.location_name)).map((name) => (
              <span key={name} className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-200">
                {name}
              </span>
            ))}
          </div>
          {onOpenLocationsTab && (
            <button type="button" onClick={onOpenLocationsTab} className="mt-2 text-[11px] text-teal-300/80 hover:text-teal-200">
              View locations →
            </button>
          )}
        </section>
      )}

      {isCompany && onOpenTimelineTab && (
        <button type="button" onClick={onOpenTimelineTab} className="w-full text-xs py-2 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-200/80 flex items-center justify-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          View employment timeline →
        </button>
      )}
    </div>
  );
};

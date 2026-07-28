import { shortDisplayName } from '../../lib/displayName';
import {
  Users,
  MapPin,
  Calendar,
  BookOpen,
  ChevronRight,
  Sparkles,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type {
  Organization,
  OrganizationEvent,
  OrganizationMember,
  OrganizationStory,
} from './OrganizationProfileCard';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';
import { GroupDetailPanel } from './GroupDetailPanel';

type OverviewTab =
  | 'members'
  | 'locations'
  | 'timeline'
  /** @deprecated aliased by parent normalize to timeline */
  | 'activity'
  | 'family'
  | 'stories'
  | 'chat';

type Props = {
  organization: Organization;
  allOrganizations: Organization[];
  members: OrganizationMember[];
  stories: OrganizationStory[];
  events: OrganizationEvent[];
  derivedEvents?: OrgDerivedEvent[];
  derivedLoading?: boolean;
  locationCount: number;
  onSelectOrganization?: (org: Organization) => void;
  onTabChange: (tab: OverviewTab) => void;
  onMemberClick?: (member: OrganizationMember) => void;
  onOpenChat: (prompt?: string) => void;
  /** Open a specific place's own modal (e.g. a community group's linked venue). */
  onOpenLocation?: (args: { locationId?: string; locationName?: string }) => void;
};

function formatShortDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    return format(parseISO(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
  }
}

export function OrganizationModalOverview({
  organization,
  allOrganizations,
  members,
  stories,
  events,
  derivedEvents = [],
  derivedLoading = false,
  locationCount,
  onSelectOrganization,
  onTabChange,
  onMemberClick,
  onOpenChat,
  onOpenLocation,
}: Props) {
  const sortedRecorded = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const sortedDerived = [...derivedEvents].sort((a, b) => {
    const aT = a.date ? new Date(a.date).getTime() : 0;
    const bT = b.date ? new Date(b.date).getTime() : 0;
    return bT - aT;
  });
  const sortedStories = [...stories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestDerived = sortedDerived[0];
  const latestRecorded = sortedRecorded[0];
  const latestStory = sortedStories[0];
  const activityCount = derivedEvents.length > 0 ? derivedEvents.length : events.length;
  const hasLatest = Boolean(latestDerived || latestRecorded || latestStory);
  const hasPeople = members.length > 0;
  const placeLine = [organization.location, organization.founded_date ? `Since ${formatShortDate(organization.founded_date)}` : null]
    .filter(Boolean)
    .join(' · ');

  const isSparse = !hasLatest && !hasPeople && stories.length === 0 && activityCount === 0;

  return (
    <div className="space-y-3 sm:space-y-4 pb-2" data-testid="org-overview">
      {isSparse && (
        <section className="rounded-xl border border-dashed border-white/15 bg-black/25 px-4 py-5 text-center space-y-2">
          <p className="text-sm text-white/70">Not much saved about this group yet.</p>
          <p className="text-xs text-white/40 max-w-sm mx-auto leading-relaxed">
            LoreBook only shows what you’ve shared — people, stories, and moments from chat. Nothing here is invented.
          </p>
          <button
            type="button"
            onClick={() => onOpenChat(`Let me tell you about ${organization.name}: `)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-primary/25 touch-manipulation"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Add in chat
          </button>
        </section>
      )}

      {hasLatest && (
        <section className="rounded-xl border border-amber-400/15 bg-gradient-to-br from-amber-500/[0.07] to-black/40 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-300" />
            Latest
          </h3>
          {latestDerived && (
            <button
              type="button"
              onClick={() => onTabChange('timeline')}
              className="w-full text-left rounded-lg bg-black/30 border border-white/8 px-2.5 py-2 hover:border-amber-400/30 touch-manipulation"
            >
              <p className="text-[10px] text-amber-200/60 uppercase tracking-wide">From conversations</p>
              <p className="text-sm font-medium text-white truncate">{latestDerived.title}</p>
              {latestDerived.summary && (
                <p className="text-[11px] text-white/55 line-clamp-2 mt-0.5">{latestDerived.summary}</p>
              )}
            </button>
          )}
          {!latestDerived && latestRecorded && (
            <button
              type="button"
              onClick={() => onTabChange('timeline')}
              className="w-full text-left rounded-lg bg-black/30 border border-white/8 px-2.5 py-2 hover:border-amber-400/30 touch-manipulation"
            >
              <p className="text-[10px] text-amber-200/60 uppercase tracking-wide">Recorded</p>
              <p className="text-sm font-medium text-white truncate">{latestRecorded.title}</p>
            </button>
          )}
          {latestStory && (
            <button
              type="button"
              onClick={() => onTabChange('stories')}
              className="w-full text-left rounded-lg bg-black/30 border border-white/8 px-2.5 py-2 hover:border-amber-400/30 touch-manipulation"
            >
              <p className="text-[10px] text-amber-200/60 uppercase tracking-wide">Story</p>
              <p className="text-sm font-medium text-white truncate">{latestStory.title}</p>
              <p className="text-[11px] text-white/55 line-clamp-2 mt-0.5">{latestStory.summary}</p>
            </button>
          )}
        </section>
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <QuickStat icon={Users} label="People" value={members.length} onClick={() => onTabChange('members')} />
        <QuickStat icon={BookOpen} label="Stories" value={stories.length} onClick={() => onTabChange('stories')} />
        <QuickStat
          icon={Calendar}
          label="Timeline"
          value={derivedLoading && activityCount === 0 ? -1 : activityCount}
          onClick={() => onTabChange('timeline')}
        />
        <QuickStat icon={MapPin} label="Places" value={locationCount} onClick={() => onTabChange('locations')} />
      </div>

      {placeLine && (
        <p className="text-[11px] text-white/45 px-0.5">{placeLine}</p>
      )}

      {hasPeople && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Key people
            </h3>
            <button
              type="button"
              onClick={() => onTabChange('members')}
              className="text-[10px] text-primary/90 hover:text-primary flex items-center gap-0.5"
            >
              All <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {members.slice(0, 8).map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`key-person-${m.id}`}
                onClick={() => onMemberClick?.(m)}
                disabled={!onMemberClick}
                className="shrink-0 flex flex-col items-center gap-1 w-14 rounded-lg p-0.5 -m-0.5 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:pointer-events-none touch-manipulation"
                title={`Open ${m.character_name}`}
              >
                <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-white/80">
                  {m.character_name.charAt(0)}
                </div>
                <span className="text-[9px] text-white/55 truncate w-full text-center">
                  {shortDisplayName(m.character_name)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <GroupDetailPanel
        organization={organization}
        allOrganizations={allOrganizations}
        onSelectOrganization={onSelectOrganization}
        onOpenMembersTab={() => onTabChange('members')}
        onOpenLocationsTab={() => onTabChange('locations')}
        onOpenTimelineTab={() => onTabChange('timeline')}
        onOpenFamilyTab={() => onTabChange('family')}
        onOpenLocation={onOpenLocation}
        compact
      />

      <p className="text-[10px] text-center text-white/30 px-2 flex items-center justify-center gap-1 flex-wrap">
        <Sparkles className="h-3 w-3" />
        Continue in main chat —
        <button type="button" onClick={() => onOpenChat()} className="text-primary/80 hover:text-primary">
          open chat
        </button>
      </p>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  /** Pass -1 to show a loading ellipsis. */
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center hover:border-primary/30 active:scale-[0.98] transition-transform touch-manipulation"
    >
      <Icon className="h-3.5 w-3.5 text-primary/80 mx-auto mb-0.5" />
      <p className="text-base font-bold tabular-nums text-white leading-none">
        {value < 0 ? '…' : value}
      </p>
      <p className="text-[9px] text-white/40 mt-0.5">{label}</p>
    </button>
  );
}

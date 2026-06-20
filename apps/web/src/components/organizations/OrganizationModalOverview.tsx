import { useState } from 'react';
import {
  Users,
  MapPin,
  Calendar,
  BookOpen,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Clock,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type {
  Organization,
  OrganizationEvent,
  OrganizationMember,
  OrganizationStory,
} from './OrganizationProfileCard';
import { OrganizationProfilePanel } from './OrganizationProfilePanel';
import { GroupDetailPanel } from './GroupDetailPanel';

type Props = {
  organization: Organization;
  allOrganizations: Organization[];
  members: OrganizationMember[];
  stories: OrganizationStory[];
  events: OrganizationEvent[];
  locationCount: number;
  onSelectOrganization?: (org: Organization) => void;
  onTabChange: (tab: 'members' | 'locations' | 'timeline' | 'family' | 'stories' | 'events' | 'chat') => void;
  onOpenChat: (prompt?: string) => void;
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
  locationCount,
  onSelectOrganization,
  onTabChange,
  onOpenChat,
}: Props) {
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const sortedEvents = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const sortedStories = [...stories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestEvent = sortedEvents[0];
  const latestStory = sortedStories[0];

  const influence =
    organization.analytics?.group_influence_on_user ??
    Math.min(100, Math.round((members.length || 1) * 8));

  return (
    <div className="space-y-3 sm:space-y-4 pb-2">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <QuickStat icon={Users} label="People" value={members.length} onClick={() => onTabChange('members')} />
        <QuickStat icon={BookOpen} label="Stories" value={stories.length} onClick={() => onTabChange('stories')} />
        <QuickStat icon={Calendar} label="Events" value={events.length} onClick={() => onTabChange('events')} />
        <QuickStat icon={MapPin} label="Places" value={locationCount} onClick={() => onTabChange('locations')} />
      </div>

      {members.length > 0 && (
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
              <div key={m.id} className="shrink-0 flex flex-col items-center gap-1 w-14">
                <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-white/80">
                  {m.character_name.charAt(0)}
                </div>
                <span className="text-[9px] text-white/55 truncate w-full text-center">{m.character_name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(latestStory || latestEvent) && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-300" />
            Recent activity
          </h3>
          {latestStory && (
            <button
              type="button"
              onClick={() => onTabChange('stories')}
              className="w-full text-left rounded-lg bg-white/[0.03] border border-white/8 px-2.5 py-2 hover:border-primary/25 touch-manipulation"
            >
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Story</p>
              <p className="text-sm font-medium text-white truncate">{latestStory.title}</p>
              <p className="text-[11px] text-white/45 line-clamp-2 mt-0.5">{latestStory.summary}</p>
            </button>
          )}
          {latestEvent && (
            <button
              type="button"
              onClick={() => onTabChange('events')}
              className="w-full text-left rounded-lg bg-white/[0.03] border border-white/8 px-2.5 py-2 hover:border-primary/25 touch-manipulation"
            >
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Event</p>
              <p className="text-sm font-medium text-white truncate">{latestEvent.title}</p>
            </button>
          )}
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
        compact
      />

      <OrganizationProfilePanel
        organization={organization}
        variant="compact"
        onAddInfo={() => onOpenChat(`Let me tell you more about ${organization.name}: `)}
      />

      <section className="rounded-xl border border-white/8 bg-black/30 px-3 py-2.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {organization.location && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/35">Location</dt>
              <dd className="text-white/75 truncate">{organization.location}</dd>
            </div>
          )}
          {organization.founded_date && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/35">Founded</dt>
              <dd className="text-white/75">{formatShortDate(organization.founded_date)}</dd>
            </div>
          )}
        </dl>
      </section>

      {organization.analytics && (
        <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setAnalyticsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left touch-manipulation"
          >
            <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-violet-300" />
              Your involvement
            </span>
            <span className="text-xs tabular-nums text-violet-200">{influence}/100</span>
          </button>
          {analyticsOpen && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-2 border-t border-violet-500/15 pt-2">
              <Metric label="Ranking" value={`#${organization.analytics.user_ranking}`} />
              <Metric label="Involvement" value={`${organization.analytics.user_involvement_score}%`} />
            </div>
          )}
        </section>
      )}

      <p className="text-[10px] text-center text-white/30 px-2 flex items-center justify-center gap-1 flex-wrap">
        <Sparkles className="h-3 w-3" />
        Updates through chat —
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
      <p className="text-base font-bold tabular-nums text-white leading-none">{value}</p>
      <p className="text-[9px] text-white/40 mt-0.5">{label}</p>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/8 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-white/35">{label}</p>
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Group / organization timeline — with you / without you / group-wide lanes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, List, Loader2, Waves } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { EventTimelineSwimlanes, type SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import { getMockOrganizationDerivedEvents, type OrgDerivedEvent } from '../../mocks/organizationTimeline';
import type { Organization } from './OrganizationProfileCard';

type ViewMode = 'list' | 'swimlanes';

interface Props {
  organization: Organization;
  mockMode?: boolean;
  active?: boolean;
}

const AUDIENCE_LABELS: Record<NonNullable<OrgDerivedEvent['audience']>, string> = {
  with_user: 'With you',
  without_user: 'Without you',
  group_wide: 'Group-wide',
};

const AUDIENCE_BADGE: Record<NonNullable<OrgDerivedEvent['audience']>, string> = {
  with_user: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  without_user: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  group_wide: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

function fmtEventDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

function laneKeyForEvent(e: OrgDerivedEvent): string {
  if (e.audience === 'with_user' || e.user_was_present) return 'with';
  if (e.audience === 'group_wide') return 'group_wide';
  return 'without';
}

function toSwim(event: OrgDerivedEvent): SwimlaneEvent {
  return {
    id: event.id,
    title: event.title,
    date: event.date ?? '',
    laneKey: laneKeyForEvent(event),
    type: event.type,
    summary: event.summary,
    meta: [
      event.involved.length > 0
        ? `with ${event.involved.slice(0, 4).join(', ')}${event.involved.length > 4 ? ` +${event.involved.length - 4}` : ''}`
        : null,
      event.subgroup_names?.length ? `via ${event.subgroup_names.join(', ')}` : null,
    ].filter(Boolean).join(' · ') || undefined,
  };
}

export function OrganizationTimelinePanel({
  organization,
  mockMode = false,
  active = true,
}: Props) {
  const [derivedEvents, setDerivedEvents] = useState<OrgDerivedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('swimlanes');

  const loadTimeline = useCallback(async () => {
    if (!organization.id) return;
    setLoading(true);
    try {
      if (mockMode) {
        setDerivedEvents(getMockOrganizationDerivedEvents(organization));
        return;
      }
      const r = await fetchJson<{ success: boolean; events: OrgDerivedEvent[] }>(
        `/api/organizations/${organization.id}/derived-context`,
      );
      if (r.success) {
        // Backend events may omit array fields — normalize so render code can
        // safely read .involved.length etc. (production crash: 'involved' undefined).
        setDerivedEvents(
          (r.events || []).map((e) => ({
            ...e,
            involved: e.involved ?? [],
            subgroup_names: e.subgroup_names ?? [],
          })),
        );
      }
    } catch {
      // keep prior data on refresh failure
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [organization, mockMode]);

  useEffect(() => {
    setLoaded(false);
    setDerivedEvents([]);
  }, [organization.id]);

  useEffect(() => {
    if (!active || loaded) return;
    void loadTimeline();
  }, [active, loaded, loadTimeline]);

  useEffect(() => {
    return onStoryDataUpdated(() => {
      setLoaded(false);
    });
  }, [organization.id]);

  const sortedEvents = useMemo(
    () =>
      sortTimelineEventsChronologically(
        derivedEvents.map(e => ({ ...e, eventDate: e.date ?? '' })),
        'asc',
      ),
    [derivedEvents],
  );

  const swimEvents = useMemo(() => derivedEvents.map(toSwim), [derivedEvents]);

  const laneCounts = useMemo(() => ({
    with: derivedEvents.filter(e => laneKeyForEvent(e) === 'with').length,
    without: derivedEvents.filter(e => laneKeyForEvent(e) === 'without').length,
    group_wide: derivedEvents.filter(e => laneKeyForEvent(e) === 'group_wide').length,
  }), [derivedEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-400" />
            Event Timeline
          </h3>
          <p className="text-xs text-white/45 mt-1">
            Events involving {organization.name}&apos;s members (including subgroups), split by your involvement and group-wide impact.
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition ${
              viewMode === 'list'
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:text-white/70'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('swimlanes')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border-l border-white/10 transition ${
              viewMode === 'swimlanes'
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:text-white/70'
            }`}
          >
            <Waves className="h-3.5 w-3.5" />
            Swimlanes
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        loading ? (
          <div className="h-48 flex items-center justify-center text-white/50 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading timeline…
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Clock className="h-8 w-8 text-white/20" />
            <p className="text-white/60 font-medium">No events yet</p>
            <p className="text-white/30 text-sm max-w-sm">
              Events show up here as {organization.name}&apos;s members come up in your conversations.
            </p>
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-3 space-y-0">
            {sortedEvents.map((event, idx) => {
              const audience = event.audience ?? (event.user_was_present ? 'with_user' : 'without_user');
              const lane = laneKeyForEvent(event);
              const dotColor =
                lane === 'with' ? 'bg-emerald-400' : lane === 'group_wide' ? 'bg-amber-400' : 'bg-violet-400';
              return (
                <li key={event.id} className="relative pl-6 pb-6 last:pb-0">
                  <span
                    className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${dotColor}`}
                  />
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 hover:bg-black/35 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <time className="text-xs font-mono text-primary/80">{fmtEventDate(event.date)}</time>
                      <Badge variant="outline" className={`text-[10px] ${AUDIENCE_BADGE[audience]}`}>
                        {AUDIENCE_LABELS[audience]}
                      </Badge>
                      {event.type && (
                        <Badge variant="outline" className="text-[10px] text-white/50">
                          {event.type}
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-white">{event.title}</h4>
                    {event.summary && (
                      <p className="text-xs text-white/60 mt-1 leading-relaxed">{event.summary}</p>
                    )}
                    {event.involved.length > 0 && (
                      <p className="text-[10px] text-white/40 mt-2">
                        with {event.involved.slice(0, 4).join(', ')}
                        {event.involved.length > 4 ? ` +${event.involved.length - 4}` : ''}
                      </p>
                    )}
                  </div>
                  {idx < sortedEvents.length - 1 && <span className="sr-only">then</span>}
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <EventTimelineSwimlanes
          loading={loading}
          lanes={[
            { key: 'with', label: 'With you', accent: 'emerald', hint: 'You were there' },
            { key: 'without', label: 'Without you', accent: 'violet', hint: "Member-only — you weren't present" },
            { key: 'group_wide', label: 'Group-wide', accent: 'amber', hint: 'Affects the whole group or multiple members' },
          ]}
          events={swimEvents}
          emptyTitle="No events yet"
          emptyHint={`Events show up here as ${organization.name}'s members come up in your conversations.`}
        />
      )}

      <div className="flex items-center gap-4 text-xs text-white/40 pt-1 flex-wrap">
        <span>
          <span className="text-emerald-300 font-medium">{laneCounts.with}</span> with you
        </span>
        <span>
          <span className="text-violet-300 font-medium">{laneCounts.without}</span> without you
        </span>
        <span>
          <span className="text-amber-300 font-medium">{laneCounts.group_wide}</span> group-wide
        </span>
        {sortedEvents.length > 0 && sortedEvents[0].date && sortedEvents[sortedEvents.length - 1].date && (
          <span className="text-white/30">
            {fmtEventDate(sortedEvents[0].date)} → {fmtEventDate(sortedEvents[sortedEvents.length - 1].date)}
          </span>
        )}
      </div>
    </div>
  );
}

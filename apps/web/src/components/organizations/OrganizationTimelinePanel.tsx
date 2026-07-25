/**
 * Group / organization timeline — two lanes shaped by Our relationship stance
 * (Mine / Close to / Their world / Mentioned). Group-wide moments fold into the
 * “without” lane and keep a list badge when tagged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, List, Loader2, Waves } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { EventTimelineSwimlanes, type SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import {
  getOrganizationTimelineVoice,
  ORGANIZATION_STANCE_LABELS,
} from '../../lib/organizationStance';
import { getMockOrganizationDerivedEvents, type OrgDerivedEvent } from '../../mocks/organizationTimeline';
import type { Organization } from './OrganizationProfileCard';

type ViewMode = 'list' | 'swimlanes';

interface Props {
  organization: Organization;
  mockMode?: boolean;
  active?: boolean;
  /** When provided, use these instead of fetching derived-context. */
  events?: OrgDerivedEvent[];
  loading?: boolean;
  /** Override auto title from stance voice. */
  title?: string;
  /** Override auto description from stance voice. */
  description?: string;
}

const GROUP_WIDE_BADGE = 'bg-amber-500/15 text-amber-300 border-amber-500/30';

function fmtEventDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

/** Two lanes; group-wide rides in the “without” lane. */
function laneKeyForEvent(e: OrgDerivedEvent): 'with' | 'without' {
  if (e.audience === 'with_user' || e.user_was_present) return 'with';
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

function audienceBadgeLabel(
  audience: NonNullable<OrgDerivedEvent['audience']>,
  voice: ReturnType<typeof getOrganizationTimelineVoice>,
): string {
  if (audience === 'group_wide') return 'Group-wide';
  if (audience === 'with_user') return voice.withBadge;
  return voice.withoutBadge;
}

function audienceBadgeClass(audience: NonNullable<OrgDerivedEvent['audience']>): string {
  if (audience === 'group_wide') return GROUP_WIDE_BADGE;
  if (audience === 'with_user') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

export function OrganizationTimelinePanel({
  organization,
  mockMode = false,
  active = true,
  events: externalEvents,
  loading: externalLoading,
  title: titleOverride,
  description: descriptionOverride,
}: Props) {
  const controlled = externalEvents !== undefined;
  const [derivedEvents, setDerivedEvents] = useState<OrgDerivedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('swimlanes');

  const voice = useMemo(() => getOrganizationTimelineVoice(organization), [organization]);

  const loadTimeline = useCallback(async () => {
    if (!organization.id || controlled) return;
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
  }, [organization, mockMode, controlled]);

  useEffect(() => {
    if (controlled) return;
    setLoaded(false);
    setDerivedEvents([]);
  }, [organization.id, controlled]);

  useEffect(() => {
    if (controlled || !active || loaded) return;
    void loadTimeline();
  }, [active, loaded, loadTimeline, controlled]);

  useEffect(() => {
    if (controlled) return;
    return onStoryDataUpdated(() => {
      setLoaded(false);
    });
  }, [organization.id, controlled]);

  const events = controlled
    ? (externalEvents ?? []).map((e) => ({
        ...e,
        involved: e.involved ?? [],
        subgroup_names: e.subgroup_names ?? [],
      }))
    : derivedEvents;
  const isLoading = controlled ? Boolean(externalLoading) : loading;

  const sortedEvents = useMemo(
    () =>
      sortTimelineEventsChronologically(
        events.map(e => ({ ...e, eventDate: e.date ?? '' })),
        'asc',
      ),
    [events],
  );

  const swimEvents = useMemo(() => events.map(toSwim), [events]);

  const laneCounts = useMemo(() => ({
    with: events.filter(e => laneKeyForEvent(e) === 'with').length,
    without: events.filter(e => laneKeyForEvent(e) === 'without').length,
  }), [events]);

  const title = titleOverride ?? voice.title;
  const subtitle = descriptionOverride ?? voice.description;

  return (
    <div className="space-y-4" data-testid="org-timeline-stance" data-stance={voice.stance}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-white/15 text-white/65 bg-white/[0.03]"
              title={voice.stanceHint}
              data-testid="org-timeline-stance-badge"
            >
              {ORGANIZATION_STANCE_LABELS[voice.stance]}
            </Badge>
            <span className="text-[11px] text-white/35">{voice.stanceHint}</span>
          </div>
          <p className="text-xs text-white/45 mt-1.5">{subtitle}</p>
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
        isLoading ? (
          <div className="h-48 flex items-center justify-center text-white/50 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading timeline…
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Clock className="h-8 w-8 text-white/20" />
            <p className="text-white/60 font-medium">{voice.emptyTitle}</p>
            <p className="text-white/30 text-sm max-w-sm">{voice.emptyHint}</p>
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-3 space-y-0">
            {sortedEvents.map((event, idx) => {
              const audience = event.audience ?? (event.user_was_present ? 'with_user' : 'without_user');
              const lane = laneKeyForEvent(event);
              const dotColor = lane === 'with' ? 'bg-emerald-400' : 'bg-sky-400';
              return (
                <li key={event.id} className="relative pl-6 pb-6 last:pb-0">
                  <span
                    className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${dotColor}`}
                  />
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 hover:bg-black/35 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <time className="text-xs font-mono text-primary/80">{fmtEventDate(event.date)}</time>
                      <Badge variant="outline" className={`text-[10px] ${audienceBadgeClass(audience)}`}>
                        {audienceBadgeLabel(audience, voice)}
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
          loading={isLoading}
          lanes={[
            { key: 'with', label: voice.withLabel, accent: 'emerald', hint: voice.withHint },
            { key: 'without', label: voice.withoutLabel, accent: 'sky', hint: voice.withoutHint },
          ]}
          events={swimEvents}
          emptyTitle={voice.emptyTitle}
          emptyHint={voice.emptyHint}
        />
      )}

      <div className="flex items-center gap-4 text-xs text-white/40 pt-1 flex-wrap">
        <span>
          <span className="text-emerald-300 font-medium">{laneCounts.with}</span> {voice.withCountLabel}
        </span>
        <span>
          <span className="text-sky-300 font-medium">{laneCounts.without}</span> {voice.withoutCountLabel}
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

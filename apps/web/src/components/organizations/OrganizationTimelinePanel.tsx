/**
 * Group / organization timeline — two lanes shaped by Our relationship stance
 * (Mine / Close to / Their world / Mentioned). Group-wide moments fold into the
 * “without” lane and keep a list badge when tagged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import {
  getOrganizationTimelineVoice,
  ORGANIZATION_STANCE_LABELS,
} from '../../lib/organizationStance';
import { getMockOrganizationDerivedEvents, type OrgDerivedEvent } from '../../mocks/organizationTimeline';
import type { Organization } from './OrganizationProfileCard';

type OrgSwimEvent = SwimlaneEvent & {
  audience: OrgDerivedEvent['audience'];
  source: OrgDerivedEvent['source'];
};

/** Shape of a row from GET /api/organizations/:id/timelines (entityTimelineBuilder.ts's EntityTimelineEvent). */
type EntityTimelineEntry = {
  id: string;
  eventId?: string;
  sourceThreadId?: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: 'shared_experience' | 'lore' | 'mentioned_in';
  entityRole?: string;
  userWasPresent: boolean;
  confidence: number;
  involvedNames?: string[];
  audience?: OrgDerivedEvent['audience'];
  source?: OrgDerivedEvent['source'];
  subgroupNames?: string[];
};

function toOrgDerivedEvent(entry: EntityTimelineEntry): OrgDerivedEvent {
  return {
    id: entry.id,
    title: entry.eventTitle,
    date: entry.eventDate,
    type: entry.eventType ?? '',
    summary: entry.eventSummary,
    involved: entry.involvedNames ?? [],
    user_was_present: entry.userWasPresent,
    audience: entry.audience,
    subgroup_names: entry.subgroupNames,
    source: entry.source ?? 'conversation',
  };
}

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
  /** Open Event detail or moment panel when a timeline row is clicked. */
  onEventSelect?: (event: OrgDerivedEvent) => void;
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

function toSwim(event: OrgDerivedEvent): OrgSwimEvent {
  return {
    id: event.id,
    title: event.title,
    date: event.date ?? '',
    laneKey: laneKeyForEvent(event),
    type: event.type,
    summary: event.summary,
    audience: event.audience,
    source: event.source,
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
  onEventSelect,
}: Props) {
  const controlled = externalEvents !== undefined;
  const [derivedEvents, setDerivedEvents] = useState<OrgDerivedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const voice = useMemo(() => getOrganizationTimelineVoice(organization), [organization]);

  const loadTimeline = useCallback(async () => {
    if (!organization.id || controlled) return;
    setLoading(true);
    try {
      if (mockMode) {
        setDerivedEvents(getMockOrganizationDerivedEvents(organization));
        return;
      }
      const r = await fetchJson<{
        success: boolean;
        timelines: { sharedExperiences: EntityTimelineEntry[]; lore: EntityTimelineEntry[] };
      }>(`/api/organizations/${organization.id}/timelines`);
      if (r.success) {
        const events = [...r.timelines.sharedExperiences, ...r.timelines.lore].map(toOrgDerivedEvent);
        setDerivedEvents(events);
        // Existing pre-feature history never got backfilled into
        // entity_timeline_events (only new events populate it going
        // forward via the live-ingestion hook) — an empty first load likely
        // means this org just hasn't been rebuilt yet, not that it has no
        // history. Self-heal once, silently, rather than requiring a manual
        // rebuild trigger the org panel doesn't otherwise expose.
        if (events.length === 0) {
          fetchJson(`/api/organizations/${organization.id}/rebuild-timelines`, { method: 'POST' })
            .then(() =>
              fetchJson<{
                success: boolean;
                timelines: { sharedExperiences: EntityTimelineEntry[]; lore: EntityTimelineEntry[] };
              }>(`/api/organizations/${organization.id}/timelines`),
            )
            .then((rebuilt) => {
              if (rebuilt.success) {
                setDerivedEvents(
                  [...rebuilt.timelines.sharedExperiences, ...rebuilt.timelines.lore].map(toOrgDerivedEvent),
                );
              }
            })
            .catch(() => {
              // leave the (empty) state from the first fetch — not worth surfacing an error for a background backfill
            });
        }
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
    <div data-testid="org-timeline-stance" data-stance={voice.stance}>
      <EntityTimelinePanel<OrgSwimEvent>
        icon={Clock}
        title={title}
        subtitle={subtitle}
        badge={{ label: ORGANIZATION_STANCE_LABELS[voice.stance], hint: voice.stanceHint, testId: 'org-timeline-stance-badge' }}
        lanes={[
          { key: 'with', label: voice.withLabel, accent: 'emerald', hint: voice.withHint },
          { key: 'without', label: voice.withoutLabel, accent: 'sky', hint: voice.withoutHint },
        ]}
        events={swimEvents}
        loading={isLoading}
        emptyTitle={voice.emptyTitle}
        emptyHint={voice.emptyHint}
        renderListItem={(event) => {
          const full = events.find((e) => e.id === event.id);
          const audience = event.audience ?? (full?.user_was_present ? 'with_user' : 'without_user');
          const dotColor = event.laneKey === 'with' ? 'bg-emerald-400' : 'bg-sky-400';
          return (
            <>
            <span
              className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${dotColor}`}
            />
            <button
              type="button"
              onClick={() => full && onEventSelect?.(full)}
              disabled={!onEventSelect}
              className={`w-full text-left rounded-lg border border-white/10 bg-black/25 p-3 transition-colors ${
                onEventSelect
                  ? 'hover:bg-black/40 hover:border-white/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40'
                  : ''
              }`}
              data-testid="org-timeline-list-event"
            >
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
                {event.source === 'user_posted' && (
                  <Badge variant="outline" className="text-[10px] border-amber-400/35 text-amber-200">
                    Posted
                  </Badge>
                )}
              </div>
              <h4 className="text-sm font-semibold text-white">{event.title}</h4>
              {event.summary && (
                <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-4 sm:line-clamp-none">
                  {event.summary}
                </p>
              )}
              {event.meta && <p className="text-[10px] text-white/40 mt-2">{event.meta}</p>}
            </button>
            </>
          );
        }}
        onEventSelect={(event) => {
          const full = events.find((e) => e.id === event.id);
          if (full) onEventSelect?.(full);
        }}
        footer={
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
        }
      />
    </div>
  );
}

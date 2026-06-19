/**
 * Character timeline — events with you / without you, in chronological order.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, List, RefreshCw, Loader2, Waves } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { EventTimelineSwimlanes, type SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import { getMockCharacterTimeline } from '../../mocks/characterIntelligence';
import type { Character } from './CharacterProfileCard';

export type CharTimelineEvent = {
  id: string;
  eventId?: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent?: boolean;
  characterRole?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
};

type ViewMode = 'list' | 'swimlanes';

interface Props {
  characterId: string;
  characterName: string;
  mockMode?: boolean;
  /** When false, skip fetching until the tab is opened. */
  active?: boolean;
  /** When true, copy is for the app user's own life timeline. */
  isSelfProfile?: boolean;
}

function fmtEventDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

function toSwim(event: CharTimelineEvent, laneKey: string): SwimlaneEvent {
  return {
    id: event.id,
    title: event.eventTitle,
    date: event.eventDate,
    laneKey,
    type: event.eventType,
    summary: event.eventSummary,
    meta: [event.characterRole, event.connectionCharacter ? `with ${event.connectionCharacter}` : null, event.emotionalImpact]
      .filter(Boolean)
      .join(' · ') || undefined,
  };
}

export function CharacterTimelinePanel({
  characterId,
  characterName,
  mockMode = false,
  active = true,
  isSelfProfile = false,
}: Props) {
  const firstName = characterName.split(' ')[0];
  const withLabel = isSelfProfile ? 'With others' : 'With you';
  const withoutLabel = isSelfProfile ? 'Your story' : 'Without you';
  const timelineTitle = isSelfProfile ? 'Your Timeline' : `${firstName}'s Timeline`;
  const timelineDescription = isSelfProfile
    ? 'Key moments from your life — shared experiences with others and your own story, oldest to newest.'
    : `Events you lived through together, and things ${firstName} went through without you — oldest to newest.`;
  const emptyTitle = isSelfProfile ? 'No timeline events for you yet' : `No timeline events for ${firstName} yet`;
  const emptyHint = isSelfProfile
    ? 'As you share your life in chat, milestones and shared moments will appear here in order.'
    : `As you mention ${firstName} in your conversations, shared experiences and their own story will appear here in order.`;
  const swimEmptyHint = isSelfProfile
    ? 'As you share your life in chat, milestones will plot here.'
    : `As you mention ${firstName} in your conversations, shared experiences and their own story will plot here.`;
  const countWithLabel = isSelfProfile ? 'with others' : 'with you';
  const countWithoutLabel = isSelfProfile ? 'your story' : 'without you';
  const [sharedExperiences, setSharedExperiences] = useState<CharTimelineEvent[]>([]);
  const [loreEvents, setLoreEvents] = useState<CharTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const loadTimelines = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      if (mockMode) {
        const mockCharacter = { id: characterId, name: characterName } as Character;
        const mock = getMockCharacterTimeline(mockCharacter);
        setSharedExperiences(mock.sharedExperiences);
        setLoreEvents(mock.lore);
        return;
      }
      const r = await fetchJson<{
        success: boolean;
        timelines: { sharedExperiences: CharTimelineEvent[]; lore: CharTimelineEvent[] };
      }>(`/api/conversation/characters/${characterId}/timelines`);
      if (r.success) {
        setSharedExperiences(r.timelines.sharedExperiences || []);
        setLoreEvents(r.timelines.lore || []);
      }
    } catch {
      // keep prior data on refresh failure
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [characterId, characterName, mockMode]);

  useEffect(() => {
    setLoaded(false);
    setSharedExperiences([]);
    setLoreEvents([]);
  }, [characterId]);

  useEffect(() => {
    if (!active || loaded) return;
    void loadTimelines();
  }, [active, loaded, loadTimelines]);

  useEffect(() => {
    return onStoryDataUpdated(() => {
      setLoaded(false);
    });
  }, [characterId]);

  const sortedShared = useMemo(
    () => sortTimelineEventsChronologically(sharedExperiences, 'asc'),
    [sharedExperiences],
  );
  const sortedLore = useMemo(
    () => sortTimelineEventsChronologically(loreEvents, 'asc'),
    [loreEvents],
  );

  const chronologicalList = useMemo(() => {
    const withLane = sortedShared.map(e => ({ ...e, lane: 'with' as const }));
    const withoutLane = sortedLore.map(e => ({ ...e, lane: 'without' as const }));
    return sortTimelineEventsChronologically(
      [...withLane, ...withoutLane],
      'asc',
    );
  }, [sortedShared, sortedLore]);

  const swimEvents = useMemo(
    () => [
      ...sortedShared.map(e => toSwim(e, 'with')),
      ...sortedLore.map(e => toSwim(e, 'without')),
    ],
    [sortedShared, sortedLore],
  );

  const handleRescan = () => {
    if (mockMode) return;
    setRebuilding(true);
    fetchJson(`/api/conversation/characters/${characterId}/rebuild-timelines`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
      .then(() => loadTimelines())
      .finally(() => setRebuilding(false));
  };

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary shrink-0" />
            {timelineTitle}
          </h3>
          <p className="text-xs text-white/45 mt-1">
            {isSelfProfile ? (
              <>
                <span className="sm:hidden">Your life moments, oldest to newest.</span>
                <span className="hidden sm:inline">{timelineDescription}</span>
              </>
            ) : (
              timelineDescription
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
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
          {!mockMode && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={rebuilding}
              onClick={handleRescan}
            >
              {rebuilding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Rescan conversations
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        loading ? (
          <div className="h-48 flex items-center justify-center text-white/50 text-sm">
            Loading timeline…
          </div>
        ) : chronologicalList.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Clock className="h-8 w-8 text-white/20" />
            <p className="text-white/60 font-medium">{emptyTitle}</p>
            <p className="text-white/30 text-sm max-w-sm">
              {emptyHint}
            </p>
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-3 space-y-0">
            {chronologicalList.map((event, idx) => {
              const isWith = event.lane === 'with';
              return (
                <li key={event.id} className="relative pl-6 pb-6 last:pb-0">
                  <span
                    className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${
                      isWith ? 'bg-emerald-400' : 'bg-sky-400'
                    }`}
                  />
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 hover:bg-black/35 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <time className="text-xs font-mono text-primary/80">{fmtEventDate(event.eventDate)}</time>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          isWith
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        }`}
                      >
                        {isWith ? withLabel : withoutLabel}
                      </Badge>
                      {event.eventType && (
                        <Badge variant="outline" className="text-[10px] text-white/50">
                          {event.eventType}
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-white">{event.eventTitle}</h4>
                    {event.eventSummary && (
                      <p className="text-xs text-white/60 mt-1 leading-relaxed">{event.eventSummary}</p>
                    )}
                    {(event.characterRole || event.connectionCharacter || event.emotionalImpact) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {event.characterRole && (
                          <span className="text-[10px] text-white/40">{event.characterRole}</span>
                        )}
                        {event.connectionCharacter && (
                          <span className="text-[10px] text-orange-300/80">via {event.connectionCharacter}</span>
                        )}
                        {event.emotionalImpact && (
                          <span className="text-[10px] text-white/40 capitalize">{event.emotionalImpact}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {idx < chronologicalList.length - 1 && (
                    <span className="sr-only">then</span>
                  )}
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <EventTimelineSwimlanes
          loading={loading}
          lanes={[
            { key: 'with', label: withLabel, accent: 'emerald' },
            { key: 'without', label: withoutLabel, accent: 'sky' },
          ]}
          events={swimEvents}
          emptyTitle={emptyTitle}
          emptyHint={swimEmptyHint}
        />
      )}

      <div className="flex items-center gap-4 text-xs text-white/40 pt-1">
        <span>
          <span className="text-emerald-300 font-medium">{sharedExperiences.length}</span> {countWithLabel}
        </span>
        <span>
          <span className="text-sky-300 font-medium">{loreEvents.length}</span> {countWithoutLabel}
        </span>
        {chronologicalList.length > 0 && (
          <span className="text-white/30">
            {fmtEventDate(chronologicalList[0].eventDate)} → {fmtEventDate(chronologicalList[chronologicalList.length - 1].eventDate)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Character Story — unified Events + Memories chronology for the character modal.
 * Replaces the former split Timeline / History tabs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { shortDisplayName } from '../../lib/displayName';
import {
  BookOpen,
  CalendarRange,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Heart,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { stitchedTimelineApi } from '../../api/stitchedTimeline';
import { stitchedItemsToCharacterTimeline } from '../../lib/stitchedItemsToCharacterTimeline';
import { openTimelineItemDetail } from '../../lib/resolveTimelineItemDetail';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import { EventDetailModal } from '../events/EventDetailModal';
import type { Event } from '../events/EventProfileCard';
import { getMockCharacterTimeline } from '../../mocks/characterIntelligence';
import { buildCharacterTimelineClipboardText } from '../../lib/characterTimelineClipboard';
import { clipboardFilterLines, copyTextToClipboard } from '../../lib/listClipboard';
import { EntityLorebookCompileControl } from '../lorebook/EntityLorebookCompileControl';
import type { Character } from './CharacterProfileCard';
import type { MemoryCard } from '../../types/memory';
import { compareMemoriesByOccurrence, memoryOccurrenceIso } from '../../types/memory';

export type CharTimelineEvent = {
  id: string;
  eventId?: string;
  eventTitle: string;
  eventDate: string;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  eventSummary?: string;
  eventType?: string;
  userWasPresent?: boolean;
  characterRole?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
  sourceKind?: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceId?: string;
  userPresence?: 'attended' | 'heard_about' | 'unknown';
};

export type StoryScope = 'all' | 'events' | 'memories';

export type RelationshipStage = { stage: string; start_date?: string | null };

type StoryItem =
  | { kind: 'event'; id: string; date: string; event: CharTimelineEvent & { lane: 'with' | 'without' } }
  | { kind: 'memory'; id: string; date: string; memory: MemoryCard; highlight?: string };

interface Props {
  characterId: string;
  characterName: string;
  mockMode?: boolean;
  /** When false, skip fetching until the tab is opened. */
  active?: boolean;
  /** When true, copy is for the app user's own life timeline. */
  isSelfProfile?: boolean;
  memories?: MemoryCard[];
  memoriesLoading?: boolean;
  stageHistory?: RelationshipStage[];
  onSelectMemory?: (memory: MemoryCard) => void;
  onOpenPerceptions?: () => void;
  /** Open Dating & Romance intimacy arc for this person (when a romantic relationship exists). */
  onOpenDatingArc?: () => void;
}

function fmtEventDate(iso: string): string {
  if (!iso) return 'Date unknown';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Date unknown' : format(d, 'MMM d, yyyy');
  }
}

function fmtRecorded(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const label = fmtEventDate(iso);
  return label === 'Date unknown' ? null : `Recorded ${label}`;
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

function toMockEventDetail(event: CharTimelineEvent, characterName: string): Event {
  const now = new Date().toISOString();
  return {
    // EventDetailModal treats `event-*` as a complete synthetic record and
    // never tries to hydrate it from the authenticated API.
    id: `event-${event.eventId ?? event.id}`,
    title: event.eventTitle,
    summary: event.eventSummary ?? null,
    type: event.eventType ?? null,
    start_time: event.eventDate,
    end_time: null,
    confidence: 0.85,
    people: [characterName, event.connectionCharacter].filter(
      (name): name is string => Boolean(name),
    ),
    locations: [],
    activities: event.eventType ? [event.eventType] : [],
    source_count: 1,
    created_at: now,
    updated_at: now,
    impact: {
      type: event.userWasPresent ? 'direct_participant' : 'related_person_affected',
      connectionCharacter: characterName,
      connectionType: event.characterRole,
      emotionalImpact:
        event.emotionalImpact === 'positive' ||
        event.emotionalImpact === 'negative' ||
        event.emotionalImpact === 'neutral' ||
        event.emotionalImpact === 'mixed'
          ? event.emotionalImpact
          : undefined,
      impactIntensity: 0.75,
      impactDescription: event.eventSummary,
    },
    metadata: {
      created_via: 'demo_character_timeline',
      source_event_id: event.eventId ?? event.id,
    },
  };
}

function scopeChipClass(active: boolean): string {
  return active
    ? 'bg-white/12 text-white border-white/20'
    : 'bg-transparent text-white/45 border-transparent hover:text-white/70 hover:bg-white/[0.04]';
}

export function CharacterStoryPanel({
  characterId,
  characterName,
  mockMode = false,
  active = true,
  isSelfProfile = false,
  memories = [],
  memoriesLoading = false,
  stageHistory = [],
  onSelectMemory,
  onOpenPerceptions,
  onOpenDatingArc,
}: Props) {
  const firstName = shortDisplayName(characterName);
  const withLabel = isSelfProfile ? 'With others' : 'With you';
  const withoutLabel = isSelfProfile ? 'Your story' : 'Without you';
  const storyTitle = isSelfProfile ? 'Your Story' : `${firstName}'s Story`;
  const storyDescription = isSelfProfile
    ? 'Life events and journal memories in one chronology — oldest to newest.'
    : `Events and journal memories about ${firstName} in one place — oldest to newest.`;
  const emptyTitle = isSelfProfile ? 'No story yet' : `No story for ${firstName} yet`;
  const emptyHint = isSelfProfile
    ? 'As you share your life in chat and journal, events and memories will appear here.'
    : `As you mention ${firstName} in chat and journal entries, events and memories will appear here.`;

  const [sharedExperiences, setSharedExperiences] = useState<CharTimelineEvent[]>([]);
  const [loreEvents, setLoreEvents] = useState<CharTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [scope, setScope] = useState<StoryScope>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const lifeLogHref = `/events?q=${encodeURIComponent(characterName)}`;
  const omniHref = `/timeline?view=events&characterId=${encodeURIComponent(characterId)}`;

  const openEventDetail = useCallback(async (event: CharTimelineEvent) => {
    if (mockMode) {
      setSelectedEvent(toMockEventDetail(event, characterName));
      return;
    }
    setLoadingEvent(true);
    try {
      await openTimelineItemDetail(
        {
          id: event.id,
          kind: event.sourceKind === 'journal_entry' ? 'moment' : 'event',
          sourceKind: event.sourceKind,
          sourceId: event.sourceId ?? event.eventId,
          title: event.eventTitle,
          body: event.eventSummary,
          sortTime: event.eventDate,
        },
        {
          openEvent: setSelectedEvent,
          openMemory: (memory) => {
            const existing = memories.find(
              (card) => card.id === memory.journal_entry_id || card.id === memory.id,
            );
            if (existing) {
              onSelectMemory?.(existing);
              return;
            }
            onSelectMemory?.({
              id: memory.id,
              title: memory.title ?? event.eventTitle,
              content: memory.content ?? event.eventSummary ?? '',
              date: memory.date ?? memory.start_time ?? event.eventDate,
              tags: [],
              source: 'journal',
              sourceIcon: 'book',
              characters: [characterName],
            });
          },
        },
      );
    } catch {
      // keep panel usable if detail fetch fails
    } finally {
      setLoadingEvent(false);
    }
  }, [characterName, memories, mockMode, onSelectMemory]);

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
      const result = await stitchedTimelineApi.get({
        scope_type: 'global',
        character_id: characterId,
      });
      const mapped = stitchedItemsToCharacterTimeline(result.items ?? []);
      setSharedExperiences(mapped.sharedExperiences);
      setLoreEvents(mapped.lore);
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

  const chronologicalEvents = useMemo(() => {
    const withLane = sortedShared.map((e) => ({ ...e, lane: 'with' as const }));
    const withoutLane = sortedLore.map((e) => ({ ...e, lane: 'without' as const }));
    return sortTimelineEventsChronologically([...withLane, ...withoutLane], 'asc');
  }, [sortedShared, sortedLore]);

  const sortedMemories = useMemo(
    () => [...memories].sort(compareMemoriesByOccurrence),
    [memories],
  );

  const firstMemory = sortedMemories.find((memory) => memoryOccurrenceIso(memory)) ?? null;
  const mostSignificant = useMemo(() => {
    if (sortedMemories.length === 0) return null;
    return [...sortedMemories].sort(
      (a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0),
    )[0];
  }, [sortedMemories]);

  const storyItems = useMemo((): StoryItem[] => {
    const items: StoryItem[] = [];
    const eventIds = new Set(
      chronologicalEvents.map((event) => event.eventId).filter((id): id is string => Boolean(id)),
    );
    if (scope !== 'memories') {
      for (const event of chronologicalEvents) {
        items.push({ kind: 'event', id: `event-${event.id}`, date: event.eventDate, event });
      }
    }
    if (scope !== 'events') {
      for (const memory of sortedMemories) {
        if (memory.canonicalEventId && eventIds.has(memory.canonicalEventId)) continue;
        let highlight: string | undefined;
        if (firstMemory && memory.id === firstMemory.id) highlight = 'First known occurrence';
        else if (
          mostSignificant &&
          firstMemory &&
          mostSignificant.id !== firstMemory.id &&
          memory.id === mostSignificant.id
        ) {
          highlight = 'Most significant';
        }
        items.push({
          kind: 'memory',
          id: `memory-${memory.id}`,
          date: memoryOccurrenceIso(memory) ?? '',
          memory,
          highlight,
        });
      }
    }
    return items.sort((a, b) => {
      const aValid = Boolean(a.date) && !Number.isNaN(new Date(a.date).getTime());
      const bValid = Boolean(b.date) && !Number.isNaN(new Date(b.date).getTime());
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [scope, chronologicalEvents, sortedMemories, firstMemory, mostSignificant]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return storyItems;
    return storyItems.filter((item) => {
      if (item.kind === 'event') {
        const e = item.event;
        return [e.eventTitle, e.eventSummary, e.eventType, e.characterRole, e.connectionCharacter, e.emotionalImpact]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(term));
      }
      const m = item.memory;
      return [m.title, m.content, m.mood, m.chapterTitle, ...(m.tags ?? [])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [storyItems, searchTerm]);

  const filteredEventsForSwim = useMemo(
    () =>
      filteredItems
        .filter((item): item is Extract<StoryItem, { kind: 'event' }> => item.kind === 'event')
        .map((item) => item.event),
    [filteredItems],
  );

  const swimEvents = useMemo(
    () => filteredEventsForSwim.map((event) => toSwim(event, event.lane)),
    [filteredEventsForSwim],
  );

  const clipboardText = useMemo(
    () =>
      buildCharacterTimelineClipboardText(characterName, chronologicalEvents, {
        filters: clipboardFilterLines([
          searchTerm.trim() && `search="${searchTerm.trim()}"`,
          scope !== 'all' && `scope=${scope}`,
          memories.length > 0 && `memories=${memories.length}`,
        ]),
      }),
    [characterName, chronologicalEvents, searchTerm, scope, memories.length],
  );

  const lorebookSignals = useMemo(() => {
    const days = new Set(
      chronologicalEvents
        .map((e) => (e.eventDate || '').slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );
    for (const m of sortedMemories) {
      const day = (memoryOccurrenceIso(m) || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
    }
    const wordCount =
      chronologicalEvents.reduce((sum, e) => {
        const text = `${e.eventTitle ?? ''} ${e.eventSummary ?? ''}`;
        return sum + text.trim().split(/\s+/).filter(Boolean).length;
      }, 0) +
      sortedMemories.reduce((sum, m) => {
        const text = `${m.title ?? ''} ${m.content ?? ''}`;
        return sum + text.trim().split(/\s+/).filter(Boolean).length;
      }, 0);
    return {
      eventCount: chronologicalEvents.length + sortedMemories.length,
      uniqueDays: days.size,
      wordCount,
    };
  }, [chronologicalEvents, sortedMemories]);

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(clipboardText);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleRescan = () => {
    if (mockMode) return;
    setRebuilding(true);
    void loadTimelines().finally(() => setRebuilding(false));
  };

  const isBusy = loading || memoriesLoading;
  const hasAny =
    chronologicalEvents.length > 0 || sortedMemories.length > 0 || isBusy;
  const finalEmptyTitle = searchTerm && chronologicalEvents.length > 0 ? 'No matches' : emptyTitle;
  const finalEmptyHint =
    searchTerm && chronologicalEvents.length > 0 ? `No events match "${searchTerm}".` : emptyHint;

  return (
    <div className="min-w-0 max-w-full space-y-4" data-testid="character-story-panel">
      {!isSelfProfile && onOpenDatingArc && (
        <Card className="border-pink-500/25 bg-gradient-to-r from-pink-950/30 via-purple-950/20 to-black/40">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-pink-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-white">Life chronology</h3>
                <p className="text-xs sm:text-sm text-white/55 mt-0.5 leading-relaxed">
                  Events and memories about {firstName} — open Dating &amp; Romance Overview for the intimacy arc.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenDatingArc}
              data-testid="open-dating-romance-overview"
              className="w-full sm:w-auto shrink-0 border-pink-500/30 text-pink-200 hover:bg-pink-500/10 hover:text-pink-100"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              Dating &amp; Romance · Overview
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {chronologicalEvents.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleCopyAll}
            title="Copy timeline events as plain text"
            aria-label="Copy all timeline events"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? 'Copied' : 'Copy events'}
          </Button>
        )}
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
            Rescan
          </Button>
        )}
      </div>

      {stageHistory.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">
            Relationship arc
          </p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {stageHistory.map((s, i) => (
              <div key={`${s.stage}-${i}`} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={`px-2 py-1 rounded text-[10px] font-medium ${
                    i === stageHistory.length - 1
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-white/5 text-white/35'
                  }`}
                >
                  <span className="capitalize">{s.stage}</span>
                  {s.start_date && (
                    <span className="ml-1 opacity-50">{new Date(s.start_date).getFullYear()}</span>
                  )}
                </div>
                {i < stageHistory.length - 1 && <span className="text-white/20">→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Story scope"
        data-testid="character-story-scope"
      >
        {(
          [
            { key: 'all', label: 'All', count: chronologicalEvents.length + sortedMemories.length },
            { key: 'events', label: 'Events', count: chronologicalEvents.length },
            { key: 'memories', label: 'Memories', count: sortedMemories.length },
          ] as const
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={scope === chip.key}
            onClick={() => setScope(chip.key)}
            className={`rounded-full border px-3 py-1 text-xs transition ${scopeChipClass(scope === chip.key)}`}
          >
            {chip.label}
            <span className="ml-1.5 text-white/35 tabular-nums">{chip.count}</span>
          </button>
        ))}
      </div>

      {hasAny && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${firstName}'s story…`}
            className="w-full rounded-lg border border-white/10 bg-black/25 pl-8 pr-8 py-1.5 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-primary/40"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <EntityTimelinePanel<SwimlaneEvent, StoryItem>
        icon={BookOpen}
        title={storyTitle}
        subtitle={storyDescription}
        lanes={[
          { key: 'with', label: withLabel, accent: 'emerald' },
          { key: 'without', label: withoutLabel, accent: 'sky' },
        ]}
        events={swimEvents}
        listItems={filteredItems}
        loading={isBusy && !loaded && chronologicalEvents.length === 0 && sortedMemories.length === 0}
        emptyTitle={finalEmptyTitle}
        emptyHint={finalEmptyHint}
        onEventSelect={(swimEvent) => {
          const event = filteredEventsForSwim.find((candidate) => candidate.id === swimEvent.id);
          if (event) void openEventDetail(event);
        }}
        renderListItem={(item) => {
          if (item.kind === 'event') {
            const event = item.event;
            const isWith = event.lane === 'with';
            return (
              <>
                <span
                  className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${
                    isWith ? 'bg-emerald-400' : 'bg-sky-400'
                  }`}
                />
                <button
                  type="button"
                  data-testid={`character-timeline-event-${event.id}`}
                  disabled={(!mockMode && !(event.sourceId ?? event.eventId)) || loadingEvent}
                  onClick={() => void openEventDetail(event)}
                  className="w-full text-left rounded-lg border border-white/10 bg-black/25 p-3 hover:bg-black/35 transition-colors disabled:cursor-default disabled:hover:bg-black/25"
                >
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
                    <Badge variant="outline" className="text-[10px] text-white/45">
                      Event
                    </Badge>
                    {event.eventType && (
                      <Badge variant="outline" className="text-[10px] text-white/50">
                        {event.eventType}
                      </Badge>
                    )}
                    {(mockMode || event.sourceId || event.eventId) && (
                      <span className="text-[10px] text-white/35 ml-auto">
                        {mockMode
                          ? 'Open moment'
                          : event.sourceKind === 'journal_entry'
                            ? 'Open memory'
                            : 'Open in Life Log'}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-white">{event.eventTitle}</h4>
                  {event.eventSummary && (
                    <p className="text-xs text-white/60 mt-1 leading-relaxed">{event.eventSummary}</p>
                  )}
                </button>
              </>
            );
          }

          const memory = item.memory;
          return (
            <>
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 bg-amber-400" />
              <button
                type="button"
                data-testid={`character-story-memory-${memory.id}`}
                onClick={() => onSelectMemory?.(memory)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  item.highlight
                    ? 'border-primary/30 bg-primary/5 hover:bg-primary/8'
                    : 'border-white/10 bg-black/25 hover:bg-black/35'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <time className="text-xs font-mono text-primary/80">
                    {fmtEventDate(memoryOccurrenceIso(memory) ?? '')}
                  </time>
                  {memory.occurrenceStatus === 'unresolved' && fmtRecorded(memory.recordedAt) && (
                    <span className="text-[10px] text-white/40">{fmtRecorded(memory.recordedAt)}</span>
                  )}
                  {memory.occurrenceStatus !== 'unresolved' &&
                    memory.recordedAt &&
                    memoryOccurrenceIso(memory) &&
                    memory.recordedAt.slice(0, 10) !== memoryOccurrenceIso(memory)!.slice(0, 10) && (
                      <span className="text-[10px] text-white/40">{fmtRecorded(memory.recordedAt)}</span>
                    )}
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-500/15 text-amber-200 border-amber-500/30"
                  >
                    Memory
                  </Badge>
                  {item.highlight && (
                    <span className="text-[9px] font-semibold text-primary/70 uppercase tracking-widest">
                      {item.highlight}
                    </span>
                  )}
                  {memory.mood && (
                    <span className="text-[10px] text-white/35 ml-auto capitalize">{memory.mood}</span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300/70 shrink-0" />
                  {memory.title}
                </h4>
                {memory.content && (
                  <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">
                    {memory.content.length > 140
                      ? `${memory.content.slice(0, 140)}…`
                      : memory.content}
                  </p>
                )}
              </button>
            </>
          );
        }}
        footer={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/40 pt-1 border-t border-white/5">
            <span>
              <span className="text-emerald-300 font-medium">{sharedExperiences.length}</span>{' '}
              {isSelfProfile ? 'with others' : 'with you'}
            </span>
            <span>
              <span className="text-sky-300 font-medium">{loreEvents.length}</span>{' '}
              {isSelfProfile ? 'your story' : 'without you'}
            </span>
            <span>
              <span className="text-amber-300 font-medium">{sortedMemories.length}</span> memories
            </span>
            <span className="flex items-center gap-3 ml-auto flex-wrap justify-end">
              {onOpenPerceptions && (
                <button
                  type="button"
                  onClick={onOpenPerceptions}
                  className="inline-flex items-center gap-1 text-white/45 hover:text-white/70"
                >
                  <Eye className="h-3 w-3" />
                  Perceptions
                </button>
              )}
              <Link
                to={lifeLogHref}
                data-testid="character-timeline-open-life-log"
                className="inline-flex items-center gap-1 text-emerald-300/80 hover:text-emerald-200"
              >
                <ExternalLink className="h-3 w-3" />
                Life Log
              </Link>
              <Link
                to={omniHref}
                data-testid="character-timeline-open-omni"
                className="inline-flex items-center gap-1 text-sky-300/80 hover:text-sky-200"
              >
                <CalendarRange className="h-3 w-3" />
                Omni Timeline
              </Link>
              <EntityLorebookCompileControl
                subjectLabel={characterName}
                signals={lorebookSignals}
                focus={{ characterId, themes: characterName }}
                autoFetchSignals={false}
                testId="character-timeline-create-lorebook"
              />
            </span>
          </div>
        }
      />

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

/** @deprecated Prefer CharacterStoryPanel — kept for existing imports/tests. */
export const CharacterTimelinePanel = CharacterStoryPanel;

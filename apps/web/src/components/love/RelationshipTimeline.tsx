// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useMemo, useState } from 'react';
import { Calendar, Heart, MapPin, TrendingUp, TrendingDown, Link2, Sparkles, Flame, History, UserRound } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TimelineInlineDate } from '../timeline/TimelineDateDisplay';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import { RomanceTimelineMomentPanel } from './RomanceTimelineMomentPanel';
import type { RomanticPeripheral } from '../../api/romanticPeripherals';
import {
  buildRomanceTimelineMoment,
  intimacyImpactLabel,
  type RomanceTimelineMoment,
  type RomanceTimelineRelatedLink,
} from '../../mocks/romanceTimelineMoment';

type DateEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

type LoveSwimEvent = SwimlaneEvent & {
  dateType: string;
  location?: string;
  sentiment?: number;
  isPositive: boolean;
};

type RelationshipScores = {
  affectionScore: number;
  healthScore: number;
  intensityScore: number;
  compatibilityScore?: number;
  reasons?: {
    affection?: string;
    compatibility?: string;
    health?: string;
    intensity?: string;
  };
};

type RelationshipData = {
  id: string;
  person_id?: string;
  character_id?: string | null;
  person_type?: 'character' | 'omega_entity';
  person_name?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  affection_score?: number;
  relationship_health?: number;
  emotional_intensity?: number;
};

interface RelationshipTimelineProps {
  relationshipId: string;
  dates: DateEvent[];
  relationship: RelationshipData;
  scores?: RelationshipScores;
  /** When provided, the Character Book CTA is always shown (parent may resolve/link the card). */
  onOpenCharacterTimeline?: () => void;
  /** Open a related Character Book card (Love surface usually swaps modals in-place). */
  onOpenPeripheralCharacter?: (characterId: string) => void;
  /** Close the parent relationship modal before chat handoff. */
  onCloseParentModal?: () => void;
  /** Loaded once by the parent so Overview and Timeline share one dating-history source. */
  exPartners?: RomanticPeripheral[];
  exPartnersLoading?: boolean;
}

const formatDateType = (type: string) =>
  type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

const INTIMACY_TYPES = new Set([
  'first_kiss',
  'love_declaration',
  'emotional_intimacy',
  'physical_intimacy',
  'vulnerability_moment',
  'connection_deepening',
  'connection_began',
  'anniversary',
  'reconciliation',
]);

function intimacyImpactClass(label: string): string {
  if (label === 'Peak intimacy' || label === 'Deepening' || label === 'Connection growth') {
    return 'bg-pink-500/15 text-pink-200 border-pink-500/30';
  }
  if (label === 'Strain' || label === 'Tension' || label === 'Rupture') {
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  }
  return 'bg-violet-500/15 text-violet-200 border-violet-500/30';
}

function getDateColor(type: string, wasPositive?: boolean) {
  if (type.includes('breakup') || type.includes('fight')) {
    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }
  if (INTIMACY_TYPES.has(type) || type.includes('love') || type.includes('anniversary') || wasPositive) {
    return 'border-pink-500/30 bg-pink-500/10 text-pink-300';
  }
  return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
}

function scorePct(value: number): number {
  return Math.round((value <= 1 ? value * 100 : value));
}

export const RelationshipTimeline = ({
  relationshipId,
  dates,
  relationship,
  scores,
  onOpenCharacterTimeline,
  onOpenPeripheralCharacter,
  onCloseParentModal,
  exPartners = [],
  exPartnersLoading = false,
}: RelationshipTimelineProps) => {
  const [selectedMoment, setSelectedMoment] = useState<RomanceTimelineMoment | null>(null);
  const personName = relationship.person_name ?? 'this person';
  const characterBookId =
    relationship.character_id ??
    (relationship.person_type === 'character' ? relationship.person_id : null);

  const sortedDates = useMemo(
    () => [...dates].sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()),
    [dates],
  );

  const openMoment = (event: DateEvent) => {
    setSelectedMoment(
      buildRomanceTimelineMoment({
        event,
        personName,
        relationshipId,
        characterId: characterBookId,
        allEvents: sortedDates,
      }),
    );
  };

  const openMomentById = (momentId: string) => {
    const event = sortedDates.find((d) => d.id === momentId);
    if (event) openMoment(event);
  };

  const handleOpenCharacterTimeline = () => {
    if (onOpenCharacterTimeline) {
      onOpenCharacterTimeline();
      return;
    }
    if (characterBookId) {
      openCharacterBookModal({ characterId: characterBookId, tab: 'timeline' });
    }
  };

  const canOpenCharacterTimeline = Boolean(characterBookId || onOpenCharacterTimeline);

  const openExPartner = (characterId: string) => {
    if (onOpenPeripheralCharacter) {
      onOpenPeripheralCharacter(characterId);
      return;
    }
    onCloseParentModal?.();
    openCharacterBookModal({ characterId, tab: 'info' });
  };

  const continueInChat = (prompt?: string) => {
    if (!selectedMoment) return;
    const moment = selectedMoment;
    const trimmedPrompt = prompt?.trim();
    setSelectedMoment(null);
    onCloseParentModal?.();
    openChatWithFocus({
      entityId: relationship.person_id ?? relationshipId,
      entityName: personName,
      entityType: 'relationship',
      relationshipId,
      relationshipName: personName,
      sourceSurface: 'love',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.love,
      knowledgeScope: `intimacy milestone — ${moment.title} with ${personName}`,
      ...(trimmedPrompt ? { initialPrompt: trimmedPrompt, autoSubmit: true } : {}),
      baseline: {
        affectionScore: scores ? scorePct(scores.affectionScore) : undefined,
        healthScore: scores ? scorePct(scores.healthScore) : undefined,
        connectionScore: scores ? scorePct(scores.intensityScore) : undefined,
      },
    });
  };

  const handleRelated = (link: RomanceTimelineRelatedLink) => {
    if (link.kind === 'person' && link.characterId) {
      setSelectedMoment(null);
      if (onOpenPeripheralCharacter) {
        onOpenPeripheralCharacter(link.characterId);
        return;
      }
      onCloseParentModal?.();
      openCharacterBookModal({ characterId: link.characterId, tab: 'info' });
      return;
    }
    if (link.kind === 'bond') {
      setSelectedMoment(null);
      return;
    }
  };

  const arcPoints = sortedDates.map((d, i) => {
    const sentiment = d.sentiment ?? (d.was_positive ? 0.65 : 0.35);
    return { id: d.id, pct: Math.round(sentiment * 100), index: i };
  });

  const swimEvents: LoveSwimEvent[] = sortedDates.map((date) => {
    const isPositive = date.was_positive ?? (date.sentiment != null ? date.sentiment > 0 : true);
    const impact = intimacyImpactLabel(date.date_type, date.sentiment, isPositive);
    const laneKey = impact === 'Strain' || impact === 'Tension' || impact === 'Rupture' ? 'strain' : 'growth';
    return {
      id: date.id,
      title: formatDateType(date.date_type),
      date: date.date_time,
      laneKey,
      type: impact,
      summary: date.description,
      dateType: date.date_type,
      location: date.location,
      sentiment: date.sentiment,
      isPositive,
    };
  });

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Scope banner — love timeline vs character book */}
      <Card className="border-pink-500/25 bg-gradient-to-r from-pink-950/30 via-purple-950/20 to-black/40">
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-pink-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-white">Intimacy & connection arc</h3>
              <p className="text-xs sm:text-sm text-white/55 mt-0.5 leading-relaxed">
                Tap a milestone for a summary, connected lore, and a path into main chat to ask more.
              </p>
            </div>
          </div>
          {canOpenCharacterTimeline && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenCharacterTimeline}
              data-testid="open-character-book-timeline"
              className="w-full sm:w-auto shrink-0 border-pink-500/30 text-pink-200 hover:bg-pink-500/10 hover:text-pink-100"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              Full Story timeline
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Ex-partners are relationship context, not fabricated dated events.
          Periphery extraction currently carries evidence/provenance but no
          trustworthy relationship date, so keep them in an explicit undated
          timeline section rather than inventing where they belong on the arc. */}
      <section
          className="rounded-xl border border-slate-500/20 bg-slate-950/20 p-3 sm:p-4"
          data-testid="romance-timeline-ex-partners"
        >
          <div className="mb-3 flex items-start gap-2.5">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Their dating history
              </h3>
              <p className="mt-0.5 text-xs text-white/45">
                Ex-partners and the stories {personName} shared about those relationships. Time stays unplaced unless chat recorded it.
              </p>
            </div>
          </div>

          {exPartnersLoading ? (
            <p className="text-xs text-white/40">Loading prior partners…</p>
          ) : exPartners.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center"
              data-testid="romance-timeline-ex-partners-empty"
            >
              <p className="text-sm text-white/45">No ex-partners recorded for {personName} yet.</p>
              <p className="mt-1 text-xs text-white/30">
                Stories about former partners and past experiences appear here when you share them in chat.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {exPartners.map((ex) => {
                const name = ex.peripheral_name ?? ex.peripheral_surface;
                const evidenceHistory =
                  ex.metadata?.evidence_history?.length
                    ? ex.metadata.evidence_history
                    : ex.metadata?.lexical_evidence
                      ? [{ evidence: ex.metadata.lexical_evidence, time_context: ex.metadata.time_context }]
                      : [];
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      disabled={!ex.peripheral_person_id}
                      onClick={() => ex.peripheral_person_id && openExPartner(ex.peripheral_person_id)}
                      className="flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-left transition-colors enabled:hover:border-pink-500/30 enabled:hover:bg-pink-950/15 disabled:cursor-default"
                      data-testid={`romance-timeline-ex-${ex.id}`}
                    >
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-pink-300/70" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">{name}</span>
                          <Badge
                            variant="outline"
                            className={
                              ex.tier === 'confirmed'
                                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            }
                          >
                            {ex.tier === 'confirmed' ? 'Confirmed ex' : 'Suspected ex'}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-white/40">
                          {ex.metadata?.time_context
                            ? `Time context: ${ex.metadata.time_context}`
                            : 'Date not recorded'}
                        </span>
                        {evidenceHistory.length > 0 && (
                          <span className="mt-2 block border-t border-white/10 pt-2">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                              Stories & context ({evidenceHistory.length})
                            </span>
                            <span className="space-y-1.5">
                              {evidenceHistory.map((story, index) => (
                                <span
                                  key={`${story.message_id ?? 'story'}-${index}`}
                                  className="block text-xs leading-relaxed text-white/60"
                                >
                                  {story.time_context ? (
                                    <span className="mr-1 text-pink-200/60">{story.time_context} ·</span>
                                  ) : null}
                                  {story.evidence.replace(/^…|…$/g, '')}
                                </span>
                              ))}
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      {/* Current connection scores */}
      {scores && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
          {[
            { label: 'Affection', value: scores.affectionScore, color: 'text-pink-300', reason: scores.reasons?.affection },
            { label: 'Connection', value: scores.intensityScore, color: 'text-rose-300', reason: scores.reasons?.intensity },
            { label: 'Health', value: scores.healthScore, color: 'text-emerald-300', reason: scores.reasons?.health },
            ...(scores.compatibilityScore != null
              ? [{ label: 'Fit', value: scores.compatibilityScore, color: 'text-violet-300', reason: scores.reasons?.compatibility }]
              : []),
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-pink-500/15 bg-black/40 px-2 py-1.5 sm:p-3 text-center min-w-0"
              title={s.reason}
            >
              <p className="text-[9px] sm:text-xs text-white/45 uppercase tracking-wide leading-none">{s.label}</p>
              <p className={`text-sm sm:text-xl font-bold tabular-nums leading-tight mt-0.5 ${s.color}`}>{scorePct(s.value)}%</p>
              {s.reason && (
                <p className="mt-0.5 text-[9px] sm:text-[11px] leading-snug text-white/40 line-clamp-2 text-left sm:text-center">
                  {s.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Relationship period */}
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-3 sm:p-4">
          <h3 className="text-xs sm:text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            Bond period
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-white/70">
            {relationship.start_date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Connected since {new Date(relationship.start_date).toLocaleDateString()}</span>
              </div>
            )}
            {relationship.end_date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Ended {new Date(relationship.end_date).toLocaleDateString()}</span>
              </div>
            )}
            {!relationship.end_date && relationship.start_date && (
              <Badge variant="outline" className="bg-green-500/15 text-green-300 border-green-500/30 text-[10px] sm:text-xs">
                Ongoing bond
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Intimacy arc strip */}
      {arcPoints.length > 1 && (
        <div className="rounded-xl border border-pink-500/15 bg-black/30 p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40 mb-2">Connection intensity over time</p>
          <div className="flex items-end gap-1 h-12 sm:h-14">
            {arcPoints.map((pt) => (
              <button
                key={pt.id}
                type="button"
                className="flex-1 flex flex-col items-center gap-1 min-w-0 group"
                onClick={() => {
                  const event = sortedDates.find((d) => d.id === pt.id);
                  if (event) openMoment(event);
                }}
                title="Open milestone"
              >
                <div
                  className="w-full max-w-[2rem] mx-auto rounded-t bg-gradient-to-t from-pink-600/80 to-rose-400/90 transition-all group-hover:from-pink-500 group-hover:to-rose-300"
                  style={{ height: `${Math.max(12, pt.pct)}%` }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Milestones */}
      <EntityTimelinePanel<LoveSwimEvent>
        icon={Heart}
        title="Intimacy milestones"
        subtitle="Tap any moment for summary, connections, and chat"
        lanes={[
          { key: 'growth', label: 'Growth & closeness', accent: 'rose' },
          { key: 'strain', label: 'Strain & tension', accent: 'slate' },
        ]}
        events={swimEvents}
        onEventSelect={(event) => {
          const full = sortedDates.find((d) => d.id === event.id);
          if (full) openMoment(full);
        }}
        emptyTitle="No intimacy milestones yet"
        emptyHint="First dates, deepening moments, and bond shifts appear here as you talk about this relationship in chat."
        renderListItem={(event) => (
          <>
            <span
              className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${
                event.laneKey === 'strain' ? 'bg-red-400' : 'bg-pink-400'
              }`}
            />
            <button
              type="button"
              onClick={() => {
                const full = sortedDates.find((d) => d.id === event.id);
                if (full) openMoment(full);
              }}
              data-testid={`romance-timeline-moment-${event.id}`}
              className="w-full text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400/40"
            >
              <Card className={`w-full min-w-0 border transition-colors hover:border-pink-400/40 ${getDateColor(event.dateType, event.isPositive)}`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <TimelineInlineDate iso={event.date} size="sm" showTime={false} />
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${intimacyImpactClass(event.type ?? '')}`}
                      >
                        {event.type}
                      </Badge>
                    </div>
                    {event.sentiment !== undefined && (
                      <div className="flex items-center gap-1 shrink-0 text-xs text-white/50">
                        {event.sentiment > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        ) : event.sentiment < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                        ) : null}
                        <span>Warmth {Math.round(Math.abs(event.sentiment) * 100)}%</span>
                      </div>
                    )}
                  </div>

                  <h4 className="font-semibold text-white text-sm sm:text-base mb-1 break-words">
                    {event.title}
                  </h4>

                  {event.location && (
                    <div className="flex items-center gap-1.5 text-xs text-white/55 mb-1.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  )}

                  {event.summary && (
                    <p className="text-xs sm:text-sm text-white/75 leading-relaxed break-words line-clamp-3">
                      {event.summary}
                    </p>
                  )}
                  <p className="text-[10px] text-pink-200/70 mt-2">Open summary →</p>
                </CardContent>
              </Card>
            </button>
          </>
        )}
        footer={null}
      />

      {selectedMoment && (
        <RomanceTimelineMomentPanel
          moment={selectedMoment}
          personName={personName}
          onClose={() => setSelectedMoment(null)}
          onContinueInChat={continueInChat}
          onOpenRelated={handleRelated}
          onSelectRelatedMoment={openMomentById}
        />
      )}
    </div>
  );
};

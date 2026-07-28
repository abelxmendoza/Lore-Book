// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Calendar, Heart, MapPin, TrendingUp, TrendingDown, Link2, Sparkles, Flame } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TimelineInlineDate } from '../timeline/TimelineDateDisplay';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';

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
};

type RelationshipData = {
  id: string;
  person_id?: string;
  person_name?: string;
  start_date?: string;
  end_date?: string;
  status: string;
};

interface RelationshipTimelineProps {
  relationshipId: string;
  dates: DateEvent[];
  relationship: RelationshipData;
  scores?: RelationshipScores;
  onOpenCharacterTimeline?: () => void;
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

function intimacyImpactLabel(type: string, sentiment?: number, wasPositive?: boolean): string {
  if (type.includes('breakup') || type.includes('fight') || type.includes('distance')) return 'Strain';
  if (type.includes('breakup')) return 'Rupture';
  if (INTIMACY_TYPES.has(type)) return 'Deepening';
  if (sentiment != null && sentiment >= 0.85) return 'Peak intimacy';
  if (sentiment != null && sentiment >= 0.6) return 'Connection growth';
  if (wasPositive === false || (sentiment != null && sentiment < 0.4)) return 'Tension';
  return 'Connection moment';
}

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
  dates,
  relationship,
  scores,
  onOpenCharacterTimeline,
}: RelationshipTimelineProps) => {
  const sortedDates = [...dates].sort(
    (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
  );

  const personName = relationship.person_name ?? 'them';
  const personId = relationship.person_id;

  const handleOpenCharacterTimeline = () => {
    if (onOpenCharacterTimeline) {
      onOpenCharacterTimeline();
      return;
    }
    if (personId) {
      openCharacterBookModal({ characterId: personId, tab: 'timeline' });
    }
  };

  const arcPoints = sortedDates.map((d, i) => {
    const sentiment = d.sentiment ?? (d.was_positive ? 0.65 : 0.35);
    return { id: d.id, pct: Math.round(sentiment * 100), index: i };
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
                Milestones here track romantic closeness, vulnerability, and bond shifts with {personName} — not their full life story.
              </p>
            </div>
          </div>
          {personId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenCharacterTimeline}
              data-testid="open-character-book-timeline"
              className="w-full sm:w-auto shrink-0 border-pink-500/30 text-pink-200 hover:bg-pink-500/10 hover:text-pink-100"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              Full timeline in Character Book
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Current connection scores */}
      {scores && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Affection', value: scores.affectionScore, color: 'text-pink-300' },
            { label: 'Connection', value: scores.intensityScore, color: 'text-rose-300' },
            { label: 'Health', value: scores.healthScore, color: 'text-emerald-300' },
            ...(scores.compatibilityScore != null
              ? [{ label: 'Fit', value: scores.compatibilityScore, color: 'text-violet-300' }]
              : []),
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-pink-500/15 bg-black/40 px-2.5 py-2 sm:p-3 text-center"
            >
              <p className="text-[10px] sm:text-xs text-white/45 uppercase tracking-wide">{s.label}</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums ${s.color}`}>{scorePct(s.value)}%</p>
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
              <div key={pt.id} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div
                  className="w-full max-w-[2rem] mx-auto rounded-t bg-gradient-to-t from-pink-600/80 to-rose-400/90 transition-all"
                  style={{ height: `${Math.max(12, pt.pct)}%` }}
                  title={`${pt.pct}% warmth`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Milestones */}
      <EntityTimelinePanel<LoveSwimEvent>
        icon={Heart}
        title="Intimacy milestones"
        lanes={[
          { key: 'growth', label: 'Growth & closeness', accent: 'rose' },
          { key: 'strain', label: 'Strain & tension', accent: 'slate' },
        ]}
        events={sortedDates.map((date): LoveSwimEvent => {
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
        })}
        emptyTitle="No intimacy milestones yet"
        emptyHint="First dates, deepening moments, and bond shifts appear here as you talk about this relationship in chat."
        renderListItem={(event) => (
          <>
            <span
              className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 ${
                event.laneKey === 'strain' ? 'bg-red-400' : 'bg-pink-400'
              }`}
            />
            <Card className={`w-full min-w-0 border ${getDateColor(event.dateType, event.isPositive)}`}>
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
                  <p className="text-xs sm:text-sm text-white/75 leading-relaxed break-words">{event.summary}</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
        footer={null}
      />
    </div>
  );
};

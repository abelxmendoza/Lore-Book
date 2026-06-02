import { Clock, MapPin, Users, ChevronRight, Calendar, Briefcase, Plane, Heart, Music2, PartyPopper, Dumbbell, BookOpen, Home } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

export type Event = {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  source_count: number;
  created_at: string;
  updated_at: string;
  impact?: {
    type: 'direct_participant' | 'indirect_affected' | 'related_person_affected' | 'observer' | 'ripple_effect';
    connectionCharacter?: string;
    connectionType?: string;
    emotionalImpact?: 'positive' | 'negative' | 'neutral' | 'mixed';
    impactIntensity: number;
    impactDescription?: string;
  };
};

type EventProfileCardProps = {
  event: Event;
  onClick?: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getToneAccent = (tone?: string): string | null => {
  switch (tone) {
    case 'positive': return 'bg-emerald-400/70';
    case 'negative': return 'bg-red-400/70';
    case 'mixed': return 'bg-amber-400/70';
    default: return null;
  }
};

const getToneTooltip = (tone?: string): string => {
  switch (tone) {
    case 'positive': return 'Emotional tone: Positive — this event is associated with uplifting or rewarding feelings.';
    case 'negative': return 'Emotional tone: Difficult — this event carries heavy or challenging emotions.';
    case 'mixed': return 'Emotional tone: Mixed — this event had both positive and negative emotional dimensions.';
    default: return '';
  }
};

const getTypeIcon = (type: string | null): React.ElementType => {
  if (!type) return Calendar;
  const t = type.toLowerCase();
  if (t.includes('work') || t.includes('meeting') || t.includes('conference')) return Briefcase;
  if (t.includes('travel') || t.includes('trip') || t.includes('vacation')) return Plane;
  if (t.includes('family') || t.includes('relationship')) return Heart;
  if (t.includes('music') || t.includes('concert') || t.includes('social')) return Music2;
  if (t.includes('party') || t.includes('celebration')) return PartyPopper;
  if (t.includes('health') || t.includes('gym') || t.includes('sport')) return Dumbbell;
  if (t.includes('education') || t.includes('learn') || t.includes('study')) return BookOpen;
  if (t.includes('personal') || t.includes('home')) return Home;
  return Calendar;
};

const formatNames = (names: string[], maxShown = 2): string => {
  if (names.length === 0) return '';
  const shown = names.slice(0, maxShown);
  const extra = names.length - maxShown;
  return extra > 0 ? `${shown.join(', ')} +${extra}` : shown.join(', ');
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.4) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
};

const getConfidenceLabel = (confidence: number): string =>
  confidence >= 0.4 ? 'Unverified' : 'Low confidence';

const getConfidenceTooltip = (confidence: number): string => {
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.4) {
    return `Confidence: ${pct}% — Lorekeeper detected this event but hasn't seen it mentioned enough times to be certain about the details. Talk about it again to strengthen the memory.`;
  }
  return `Confidence: ${pct}% — This event was weakly detected. The when, who, or what may be partially reconstructed. Mention it in conversation to clarify it.`;
};

const getImpactLabel = (type: string): string => {
  switch (type) {
    case 'direct_participant': return 'You were there';
    case 'indirect_affected': return 'Affects you';
    case 'related_person_affected': return 'Affects someone close';
    case 'ripple_effect': return 'Ripple effect';
    default: return 'Related';
  }
};

const getImpactTooltip = (type: string, impactDescription?: string): string => {
  if (impactDescription) return impactDescription;
  switch (type) {
    case 'direct_participant': return 'You were directly present at this event — it\'s a first-hand memory.';
    case 'indirect_affected': return 'You weren\'t physically there, but this event directly affected your life or feelings.';
    case 'related_person_affected': return 'Someone close to you was at the center of this event. It matters to you because of your relationship with them.';
    case 'ripple_effect': return 'This event had downstream effects that reached you over time, even if you weren\'t immediately involved.';
    default: return 'This event is connected to your story.';
  }
};

const getImpactColor = (type: string): string => {
  switch (type) {
    case 'direct_participant': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'indirect_affected': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'related_person_affected': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'ripple_effect': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const formatDate = (dateString: string) => {
  try { return format(parseISO(dateString), 'MMM d, yyyy'); } catch { return dateString; }
};

const formatRelative = (dateString: string) => {
  try { return formatDistanceToNow(parseISO(dateString), { addSuffix: true }); } catch { return ''; }
};

const formatFull = (dateString: string) => {
  try { return format(parseISO(dateString), 'EEEE, MMMM d, yyyy · h:mm a'); } catch { return dateString; }
};

// ─── Component ───────────────────────────────────────────────────────────────

export const EventProfileCard = ({ event, onClick }: EventProfileCardProps) => {
  const toneAccent = getToneAccent(event.impact?.emotionalImpact);
  const toneTooltip = getToneTooltip(event.impact?.emotionalImpact);
  const peopleDisplay = formatNames(event.people, 2);
  const locationDisplay = formatNames(event.locations, 1);
  const showConfidence = event.confidence < 0.70;
  const showImpact = event.impact && event.impact.type !== 'observer';
  const TypeIcon = getTypeIcon(event.type);
  const relative = formatRelative(event.start_time);

  return (
    <Card
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-slate-900/90 via-slate-800/60 to-slate-900/90 border-border/50 overflow-hidden flex flex-col aspect-square sm:aspect-auto w-full relative"
      onClick={onClick}
    >
      {/* Emotional tone accent strip */}
      {toneAccent && toneTooltip ? (
        <Tooltip content={toneTooltip} side="top">
          <div className={`absolute top-0 left-0 right-0 h-1 z-10 cursor-help ${toneAccent}`} />
        </Tooltip>
      ) : toneAccent ? (
        <div className={`absolute top-0 left-0 right-0 h-1 z-10 ${toneAccent}`} />
      ) : null}

      {/* Header */}
      <div className="relative h-10 sm:h-14 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <div className="relative z-10">
          <Tooltip content={event.type ? `Event type: ${event.type}` : 'Event'} side="top">
            <TypeIcon className="h-7 w-7 text-primary cursor-help" />
          </Tooltip>
        </div>

        {/* Confidence badge */}
        {showConfidence && (
          <div className="absolute top-2 right-2 z-10">
            <Tooltip content={getConfidenceTooltip(event.confidence)} side="left">
              <Badge
                variant="outline"
                className={`${getConfidenceColor(event.confidence)} text-[10px] px-1.5 py-0.5 cursor-help`}
              >
                {getConfidenceLabel(event.confidence)}
              </Badge>
            </Tooltip>
          </div>
        )}

        {/* Relative time — top left */}
        {relative && (
          <div className="absolute top-2 left-2 z-10">
            <Tooltip content={formatFull(event.start_time)} side="right">
              <span className="text-[9px] text-white/35 cursor-help leading-none">{relative}</span>
            </Tooltip>
          </div>
        )}
      </div>

      <CardHeader className="pb-1 pt-2 sm:pt-2.5 px-3 sm:px-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-white group-hover:text-primary transition-colors line-clamp-2">
              {event.title}
            </h3>
            {event.type && (
              <Tooltip content={`Event category: ${event.type}. Lorekeeper detected this as a ${event.type} event based on the context of your conversations.`} side="top">
                <p className="text-[10px] text-white/50 mt-0.5 truncate capitalize cursor-help hover:text-white/70 transition-colors">
                  {event.type}
                </p>
              </Tooltip>
            )}

            {/* Impact badge */}
            {showImpact && (
              <Tooltip content={getImpactTooltip(event.impact!.type, event.impact!.impactDescription)} side="bottom">
                <Badge
                  variant="outline"
                  className={`${getImpactColor(event.impact!.type)} text-[10px] px-1.5 py-0.5 mt-1 inline-flex items-center gap-1 cursor-help`}
                >
                  {getImpactLabel(event.impact!.type)}
                  {event.impact!.connectionCharacter && (
                    <span className="text-white/50 text-[9px]">via {event.impact!.connectionCharacter}</span>
                  )}
                </Badge>
              </Tooltip>
            )}
          </div>
          <ChevronRight className="h-3 w-3 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 mt-0.5" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-hidden space-y-1 sm:space-y-1.5 pt-0 px-3 sm:px-4 pb-2 sm:pb-3">
        {event.summary && (
          <p className="text-[10px] sm:text-xs text-white/65 line-clamp-2 leading-snug">
            {event.summary}
          </p>
        )}

        {/* Metadata — names + date */}
        <div className="hidden sm:flex flex-col gap-0.5 text-[10px] text-white/55">
          <Tooltip content={`Date: ${formatFull(event.start_time)}`} side="top">
            <div className="flex items-center gap-1 cursor-help w-fit">
              <Clock className="h-2.5 w-2.5 flex-shrink-0 text-white/40" />
              <span>{formatDate(event.start_time)}</span>
            </div>
          </Tooltip>

          {peopleDisplay && (
            <Tooltip
              content={`People at this event: ${event.people.join(', ')}. These are the people Lorekeeper detected in your conversations about this moment.`}
              side="top"
            >
              <div className="flex items-center gap-1 cursor-help w-fit">
                <Users className="h-2.5 w-2.5 flex-shrink-0 text-blue-400/60" />
                <span className="text-blue-300/80 truncate">{peopleDisplay}</span>
              </div>
            </Tooltip>
          )}

          {locationDisplay && (
            <Tooltip
              content={`Location: ${event.locations.join(', ')}. Where this event took place based on your conversations.`}
              side="top"
            >
              <div className="flex items-center gap-1 cursor-help w-fit">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0 text-emerald-400/60" />
                <span className="text-emerald-300/80 truncate">{locationDisplay}</span>
              </div>
            </Tooltip>
          )}
        </div>

        {/* Source count */}
        {event.source_count > 0 && (
          <div className="hidden sm:block">
            <Tooltip
              content={`${event.source_count} conversation${event.source_count === 1 ? '' : 's'} mention this event. More sources = higher confidence.`}
              side="top"
            >
              <span className="text-[9px] text-white/30 cursor-help hover:text-white/50 transition-colors">
                {event.source_count} {event.source_count === 1 ? 'source' : 'sources'}
              </span>
            </Tooltip>
          </div>
        )}

        {/* Activities */}
        {event.activities && event.activities.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-1 pt-1 border-t border-border/20">
            {event.activities.slice(0, 3).map(activity => (
              <Tooltip
                key={activity}
                content={`Activity: ${activity}. Lorekeeper detected this activity as part of this event.`}
                side="top"
              >
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] bg-primary/8 text-primary/80 border-primary/25 cursor-help hover:bg-primary/15 transition-colors"
                >
                  {activity}
                </Badge>
              </Tooltip>
            ))}
            {event.activities.length > 3 && (
              <Tooltip content={`${event.activities.length - 3} more activities: ${event.activities.slice(3).join(', ')}`} side="top">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-white/40 border-border/25 cursor-help">
                  +{event.activities.length - 3}
                </Badge>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

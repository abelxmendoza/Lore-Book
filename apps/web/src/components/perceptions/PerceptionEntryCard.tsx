import { Eye, EyeOff, AlertTriangle, CheckCircle, XCircle, Clock, User, MessageSquare, Link2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import type { PerceptionEntry, PerceptionStatus } from '../../types/perception';
import { formatDistanceToNow } from 'date-fns';
import { formatEpistemicPercent } from '../../lib/epistemicLabels';

type PerceptionEntryCardProps = {
  perception: PerceptionEntry;
  onEdit?: (perception: PerceptionEntry) => void;
  onRetract?: (perception: PerceptionEntry) => void;
  onResolve?: (perception: PerceptionEntry, status: PerceptionStatus, notes?: string) => void;
  onClick?: (perception: PerceptionEntry) => void;
  showSubject?: boolean;
};

export const PerceptionEntryCard = ({
  perception,
  onEdit,
  onRetract,
  onResolve,
  onClick,
  showSubject = true
}: PerceptionEntryCardProps) => {
  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'overheard':
        return <Eye className="h-3.5 w-3.5" />;
      case 'told_by':
        return <MessageSquare className="h-3.5 w-3.5" />;
      case 'rumor':
        return <AlertTriangle className="h-3.5 w-3.5" />;
      case 'social_media':
        return <Link2 className="h-3.5 w-3.5" />;
      case 'intuition':
        return <EyeOff className="h-3.5 w-3.5" />;
      default:
        return <MessageSquare className="h-3.5 w-3.5" />;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'overheard':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'told_by':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'rumor':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      case 'social_media':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'intuition':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getConfidenceColor = (level: string | number) => {
    // Handle numeric confidence (0.0 to 1.0)
    if (typeof level === 'number') {
      if (level < 0.4) return 'bg-red-500/10 text-red-400 border-red-500/30';
      if (level < 0.7) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      return 'bg-green-500/10 text-green-400 border-green-500/30';
    }
    // Handle string confidence (legacy)
    switch (level) {
      case 'very_low':
      case 'low':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'high':
      case 'very_high':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getResolutionIcon = (status?: string | null) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'disproven':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'retracted':
        return <XCircle className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  // HARD RULE: Visual treatment - desaturated, muted, unstable appearance
  const isRetracted = perception.retracted || perception.status === 'retracted';
  const isUnverified = perception.status === 'unverified';
  const isConfirmed = perception.status === 'confirmed';
  const isDisproven = perception.status === 'disproven';
  const needsReview =
    Boolean(perception.review_reminder_at) &&
    new Date(perception.review_reminder_at!) <= new Date() &&
    !isRetracted;

  // Visual treatment: desaturated/muted for perceptions (80% opacity default)
  return (
    <Card
      className={`h-fit w-full min-w-0 max-w-full overflow-visible transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/20 hover:-translate-y-1 active:scale-[0.99] touch-manipulation' : ''
      } ${
        isRetracted
          ? 'opacity-50 border-dashed border-2 border-gray-500/30 bg-gray-900/20'
          : isUnverified
          ? 'border-violet-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
          : isConfirmed
          ? 'border-green-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-85'
          : isDisproven
          ? 'border-red-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
          : 'border-border/50 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
      }`}
      onClick={() => onClick?.(perception)}
    >
      <CardContent className="space-y-2 overflow-visible p-2.5 sm:space-y-3 sm:p-4">
        {/* Header with source and confidence — stack on narrow 2-col mobile cards */}
        <div className="flex flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={`${getSourceColor(perception.source)} flex items-center gap-1 px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-xs`}
            >
              {getSourceIcon(perception.source)}
              <span className="capitalize whitespace-nowrap">{perception.source.replace('_', ' ')}</span>
            </Badge>
            <Badge
              variant="outline"
              className={`${getConfidenceColor(perception.confidence_level)} px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-xs whitespace-nowrap`}
            >
              {typeof perception.confidence_level === 'number'
                ? formatEpistemicPercent(perception.confidence_level)
                : perception.confidence_level.replace('_', ' ')}
            </Badge>
            {needsReview ? (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 sm:px-2 sm:text-xs whitespace-nowrap"
              >
                Needs review
              </Badge>
            ) : null}
            {perception.status === 'retracted' || perception.retracted ? (
              <Badge variant="outline" className="border-gray-500/30 bg-gray-500/10 px-2 py-0.5 text-xs text-gray-400 line-through">
                Retracted
              </Badge>
            ) : null}
            <span>{getResolutionIcon(perception.status)}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/40 sm:text-xs">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap">
              {formatDistanceToNow(new Date(perception.timestamp_heard), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Subject */}
        {showSubject && (perception.subject_alias || perception.subject_person_id) && (
          <div className="flex items-start gap-1.5 text-xs sm:gap-2 sm:text-sm">
            <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/50" />
            <span className="min-w-0 break-words text-white/70">
              <span className="text-white/50">About: </span>
              <span className="font-medium text-white">{perception.subject_alias || 'Unknown'}</span>
            </span>
          </div>
        )}

        {/* Content — full text, never clamped or ellipsized */}
        <div className="break-words text-xs leading-relaxed text-white/80 sm:text-sm">
          {perception.content}
        </div>

        {/* Impact on Me (Key Insight Lever) — always visible */}
        {perception.impact_on_me ? (
          <div className="border-t border-border/30 pt-2">
            <p className="mb-1 text-xs font-medium text-white/50">Impact on Me:</p>
            <p className="break-words text-xs italic leading-relaxed text-white/70 sm:text-sm">
              {perception.impact_on_me}
            </p>
          </div>
        ) : null}

        {/* Evolution Notes (if any) */}
        {perception.evolution_notes && perception.evolution_notes.length > 0 && (
          <div className="border-t border-border/30 pt-2">
            <p className="mb-1 text-xs font-medium text-white/50">Belief Evolution:</p>
            <div className="space-y-1">
              {perception.evolution_notes.map((note, idx) => (
                <p key={idx} className="break-words text-xs leading-relaxed text-white/60">{note}</p>
              ))}
            </div>
          </div>
        )}

        {/* Original Content (if different from current) */}
        {perception.original_content && perception.original_content !== perception.content && (
          <div className="border-t border-border/30 pt-2">
            <p className="mb-1 text-xs font-medium text-white/50">Original Belief:</p>
            <p className="break-words text-xs italic leading-relaxed text-white/60 line-through opacity-70">
              {perception.original_content}
            </p>
          </div>
        )}

        {/* Resolution note (tracks evolution) */}
        {perception.resolution_note && (
          <div className="border-t border-border/30 pt-2">
            <p className="mb-1 text-xs font-medium text-white/50">
              {perception.status === 'retracted' ? 'Retraction:' : 'Resolution:'}
            </p>
            <p className="break-words text-xs italic leading-relaxed text-white/70">{perception.resolution_note}</p>
          </div>
        )}

        {/* Warning labels for unstable perceptions (MANDATORY for unverified) */}
        {isUnverified && !isRetracted && (
          <div className="flex items-start gap-2 border-t border-violet-500/20 pt-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/70" />
            <span className="break-words text-xs leading-relaxed text-violet-400/70">
              Unverified • Secondhand • Belief at the time
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

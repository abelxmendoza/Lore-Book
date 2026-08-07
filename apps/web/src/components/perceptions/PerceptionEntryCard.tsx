import { formatDistanceToNow } from 'date-fns';
import { Eye, EyeOff, AlertTriangle, Clock, User, MessageSquare, Link2, History, BookOpenCheck } from 'lucide-react';

import { formatEpistemicPercent } from '../../lib/epistemicLabels';
import type { PerceptionEntry, PerceptionStatus } from '../../types/perception';
import { EpistemicStatusBadge } from '../epistemic/EpistemicStatusBadge';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

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
  onClick,
  showSubject = true
}: PerceptionEntryCardProps) => {
  const sourceLabel = perception.source.replace('_', ' ');
  const certaintyLabel = typeof perception.confidence_level === 'number'
    ? formatEpistemicPercent(perception.confidence_level)
    : perception.confidence_level.replace('_', ' ');
  const heardAt = formatDistanceToNow(new Date(perception.timestamp_heard), { addSuffix: true });
  const evolutionCount = perception.evolution_notes?.length ?? 0;

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'overheard':
        return <Eye className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
      case 'told_by':
        return <MessageSquare className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
      case 'rumor':
        return <AlertTriangle className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
      case 'social_media':
        return <Link2 className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
      case 'intuition':
        return <EyeOff className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
      default:
        return <MessageSquare className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />;
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

  // HARD RULE: Visual treatment - desaturated, muted, unstable appearance
  const isRetracted = perception.retracted || perception.status === 'retracted';
  const isUnverified = perception.status === 'unverified';
  const isConfirmed = perception.status === 'confirmed';
  const isDisproven = perception.status === 'disproven';

  // Visual treatment: desaturated/muted for perceptions (80% opacity default)
  return (
    <Card
      className={`min-w-0 transition-all duration-200 ${
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
      onKeyDown={(event) => {
        if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick(perception);
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open perception about ${perception.subject_alias || 'this person'}` : undefined}
    >
      <CardContent className="space-y-2 p-2 sm:space-y-2.5 sm:p-4">
        {/* Subject + timestamp share a row — subject is the headline, everything
            else below is supporting detail, not more headline-weight chips. */}
        <div className="flex items-start justify-between gap-2">
          {showSubject && (perception.subject_alias || perception.subject_person_id) && (
            <div className="flex min-w-0 items-center gap-1 text-[11px] sm:gap-1.5 sm:text-sm">
              <User className="h-3 w-3 shrink-0 text-white/50 sm:h-3.5 sm:w-3.5" />
              <span className="min-w-0 truncate font-medium text-white">
                {perception.subject_alias || 'Unknown'}
              </span>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-0.5 text-[8px] text-white/40 sm:gap-1 sm:text-xs">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden="true" />
            <span className="max-w-16 truncate sm:max-w-none">{heardAt}</span>
          </div>
        </div>

        {/* Source + confidence + status — compact chips, consistent across
            breakpoints so they wrap as pairs instead of one-per-line. The
            "who asserted this" badge is dropped here: every row in this book
            is hardcoded actorKind="user"/stance="user_belief" today, so it
            never varies and only added a fourth redundant chip. */}
        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1" aria-label="Source, certainty, and review status">
          <Badge
            variant="outline"
            className={`${getSourceColor(perception.source)} flex max-w-full items-center gap-0.5 px-1 py-0 text-[9px] normal-case tracking-normal sm:gap-1 sm:px-1.5 sm:text-[10px]`}
          >
            {getSourceIcon(perception.source)}
            <span className="capitalize">{sourceLabel}</span>
          </Badge>
          <Badge
            variant="outline"
            className={`${getConfidenceColor(perception.confidence_level)} px-1 py-0 text-[9px] normal-case tracking-normal sm:px-1.5 sm:text-[10px]`}
          >
            {certaintyLabel}
          </Badge>
          <EpistemicStatusBadge status={perception.status} compact />
        </div>

        {/* Content */}
        <div className="line-clamp-4 text-[10px] font-medium leading-snug text-white/85 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
          {perception.content}
        </div>

        {/* Impact on Me (Key Insight Lever) */}
        {perception.impact_on_me && (
          <div className="border-t border-border/30 pt-1.5 sm:pt-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs sm:normal-case sm:tracking-normal">Impact on me</p>
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-white/65 sm:line-clamp-none sm:text-xs sm:italic">{perception.impact_on_me}</p>
          </div>
        )}

        {(perception.source_detail || perception.related_memory_id || evolutionCount > 0) && (
          <div className="flex flex-wrap gap-x-2 gap-y-1 border-t border-border/20 pt-1.5 text-[8px] text-white/45 sm:text-[10px]">
            {perception.source_detail && (
              <span className="min-w-0 basis-full truncate sm:basis-auto" title={perception.source_detail}>
                Source: {perception.source_detail}
              </span>
            )}
            {perception.related_memory_id && (
              <span className="inline-flex items-center gap-0.5">
                <BookOpenCheck className="h-2.5 w-2.5" aria-hidden="true" /> Linked memory
              </span>
            )}
            {evolutionCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <History className="h-2.5 w-2.5" aria-hidden="true" /> Changed {evolutionCount}×
              </span>
            )}
          </div>
        )}

        {/* Evolution Notes (if any) */}
        {perception.evolution_notes && perception.evolution_notes.length > 0 && (
          <div className="hidden border-t border-border/30 pt-2 sm:block">
            <p className="text-xs text-white/50 font-medium mb-1">Belief Evolution:</p>
            <div className="space-y-1">
              {perception.evolution_notes.map((note, idx) => (
                <p key={idx} className="text-xs text-white/60">{note}</p>
              ))}
            </div>
          </div>
        )}

        {/* Original Content (if different from current) */}
        {perception.original_content && perception.original_content !== perception.content && (
          <div className="hidden border-t border-border/30 pt-2 sm:block">
            <p className="text-xs text-white/50 font-medium mb-1">Original Belief:</p>
            <p className="text-xs text-white/60 italic line-through opacity-70">{perception.original_content}</p>
          </div>
        )}

        {/* Resolution note (tracks evolution) */}
        {perception.resolution_note && (
          <div className="border-t border-border/30 pt-1.5 sm:pt-2">
            <p className="text-xs text-white/50 font-medium mb-1">
              {perception.status === 'retracted' ? 'Retraction:' : 'Resolution:'}
            </p>
            <p className="line-clamp-2 text-[9px] italic text-white/70 sm:line-clamp-none sm:text-xs">{perception.resolution_note}</p>
          </div>
        )}

        {/* Warning labels for unstable perceptions (MANDATORY for unverified) */}
        {isUnverified && !isRetracted && (
          <div className="flex items-start gap-1 border-t border-violet-500/20 pt-1.5 sm:items-center sm:gap-2 sm:pt-2">
            <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0 text-violet-400/70 sm:mt-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
            <span className="text-[8px] leading-tight text-violet-300/70 sm:text-xs">Belief at the time — not verified fact</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

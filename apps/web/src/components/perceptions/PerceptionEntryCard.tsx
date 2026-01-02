import { Eye, EyeOff, AlertTriangle, CheckCircle, XCircle, Clock, User, MessageSquare, Link2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import type { PerceptionEntry, PerceptionStatus } from '../../types/perception';
import { formatDistanceToNow } from 'date-fns';

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
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
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

  // Visual treatment: desaturated/muted for perceptions (80% opacity default)
  return (
    <Card
      className={`transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/20 hover:-translate-y-1' : ''
      } ${
        isRetracted
          ? 'opacity-50 border-dashed border-2 border-gray-500/30 bg-gray-900/20'
          : isUnverified
          ? 'border-orange-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
          : isConfirmed
          ? 'border-green-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-85'
          : isDisproven
          ? 'border-red-500/30 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
          : 'border-border/50 bg-gradient-to-br from-black/60 via-black/40 to-black/60 opacity-80'
      }`}
      onClick={() => onClick?.(perception)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header with source and confidence */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`${getSourceColor(perception.source)} text-xs px-2 py-0.5 flex items-center gap-1`}
            >
              {getSourceIcon(perception.source)}
              <span className="capitalize">{perception.source.replace('_', ' ')}</span>
            </Badge>
            <Badge
              variant="outline"
              className={`${getConfidenceColor(perception.confidence_level)} text-xs px-2 py-0.5`}
            >
              {typeof perception.confidence_level === 'number' 
                ? `${Math.round(perception.confidence_level * 100)}% confidence`
                : perception.confidence_level.replace('_', ' ')} confidence
            </Badge>
            {perception.status === 'retracted' || perception.retracted ? (
              <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/30 text-xs px-2 py-0.5 line-through">
                Retracted
              </Badge>
            ) : null}
            {getResolutionIcon(perception.status)}
          </div>
          <div className="text-xs text-white/40 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(perception.timestamp_heard), { addSuffix: true })}
          </div>
        </div>

        {/* Subject */}
        {showSubject && (perception.subject_alias || perception.subject_person_id) && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-white/50" />
            <span className="text-white/70">
              About: <span className="font-medium text-white">{perception.subject_alias || 'Unknown'}</span>
            </span>
          </div>
        )}

        {/* Content */}
        <div className="text-white/80 text-sm leading-relaxed">{perception.content}</div>

        {/* Impact on Me (Key Insight Lever) */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-white/50 font-medium mb-1">Impact on Me:</p>
          <p className="text-xs text-white/70 italic">{perception.impact_on_me}</p>
        </div>

        {/* Evolution Notes (if any) */}
        {perception.evolution_notes && perception.evolution_notes.length > 0 && (
          <div className="pt-2 border-t border-border/30">
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
          <div className="pt-2 border-t border-border/30">
            <p className="text-xs text-white/50 font-medium mb-1">Original Belief:</p>
            <p className="text-xs text-white/60 italic line-through opacity-70">{perception.original_content}</p>
          </div>
        )}

        {/* Resolution note (tracks evolution) */}
        {perception.resolution_note && (
          <div className="pt-2 border-t border-border/30">
            <p className="text-xs text-white/50 font-medium mb-1">
              {perception.status === 'retracted' ? 'Retraction:' : 'Resolution:'}
            </p>
            <p className="text-xs text-white/70 italic">{perception.resolution_note}</p>
          </div>
        )}

        {/* Warning labels for unstable perceptions (MANDATORY for unverified) */}
        {isUnverified && !isRetracted && (
          <div className="flex items-center gap-2 pt-2 border-t border-orange-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400/70" />
            <span className="text-xs text-orange-400/70">Unverified • Secondhand • Belief at the time</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import type { MouseEvent } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Calendar, BookOpen, Link2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { LexicalSignalBadges } from '../shared/LexicalSignalBadges';
import { cn } from '../../lib/cn';
import { getRomanticDemoProfile } from '../../mocks/romanticDemoProfiles';

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
  character_id?: string | null;
  character_sex?: string | null;
  user_romantic_filter?: {
    user_sex?: string | null;
    user_orientation?: string | null;
    partner_sex?: string | null;
    reviewed?: boolean;
    eligible?: boolean | null;
    note?: string;
  };
  metadata?: {
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: 'low' | 'moderate' | 'high';
    };
  } & Record<string, unknown>;
};

interface RelationshipCardProps {
  relationship: RomanticRelationship;
  onClick?: () => void;
  onOpenCharacter?: (relationship: RomanticRelationship) => void;
  onLinkCharacter?: (relationship: RomanticRelationship) => void;
  linkBusy?: boolean;
  highlighted?: boolean;
}

export const RelationshipCard = ({ relationship, onClick, onOpenCharacter, onLinkCharacter, linkBusy, highlighted }: RelationshipCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'ended':
      case 'ghosted':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'blocked':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'on_break':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'complicated':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'rekindled':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'fading':
      case 'unrequited':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatRelationshipType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const getDuration = () => {
    if (!relationship.start_date) return null;
    const start = new Date(relationship.start_date);
    const end = relationship.end_date ? new Date(relationship.end_date) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) return `${diffDays} days`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
    return `${Math.floor(diffDays / 365)} years`;
  };

  const heartFill = relationship.affection_score;
  const isActive = relationship.is_current && relationship.status === 'active';

  // Sprint AD: deterministic dynamics. When evidence is thin, show "Still
  // Learning" instead of fake-precise 0.5 scores.
  const sig = relationship.metadata?.signals;
  // Only show "Still Learning" when we POSITIVELY know evidence is thin. Rows
  // without signals (demo mock / legacy) keep showing their scores as before.
  const stillLearning = sig?.signal_strength === 'low';
  const attachment = sig?.attachment_intensity ?? 0;
  const obsession = sig?.obsession_score ?? 0;
  const attachmentLabel = attachment >= 0.66 ? 'High' : attachment >= 0.4 ? 'Moderate' : 'Low';
  const demoProfile = getRomanticDemoProfile(relationship.id);
  const cardTeaser =
    demoProfile?.headline ??
    (relationship.metadata?.lexical_evidence as string | undefined);
  const hasCharacterCard = relationship.person_type === 'character' || Boolean(relationship.character_id);
  const filterNote = relationship.user_romantic_filter?.note;
  const handleCardAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: ((relationship: RomanticRelationship) => void) | undefined,
  ) => {
    event.stopPropagation();
    action?.(relationship);
  };

  return (
    <Card
      data-testid={`relationship-card-${relationship.id}`}
      className={cn(
        "h-full border-border/60 bg-gradient-to-br from-black/40 to-black/60 cursor-pointer transition-all duration-300 hover:border-pink-500/50 hover:shadow-xl hover:shadow-pink-500/20 hover:-translate-y-1 group",
        isActive && "border-pink-500/30 bg-gradient-to-br from-pink-950/10 to-purple-950/10",
        highlighted && "animate-romantic-enter animate-romantic-glow border-pink-400/60 ring-2 ring-pink-400/50"
      )}
      onClick={onClick}
    >
      <CardContent className="flex h-full flex-col p-3 sm:p-5">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 truncate text-base font-semibold text-white transition-colors group-hover:text-pink-300 sm:text-lg">
              {relationship.person_name || formatRelationshipType(relationship.relationship_type)}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Badge variant="outline" className={cn("text-xs", getStatusColor(relationship.status))}>
                {relationship.status}
              </Badge>
              {relationship.is_situationship && (
                <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                  Situationship
                </Badge>
              )}
              <LexicalSignalBadges relationship={relationship} />
              {relationship.rank_among_active && relationship.rank_among_active <= 3 && (
                <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                  #{relationship.rank_among_active}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Heart Fill Visualization */}
          <div className="relative flex-shrink-0">
            <Heart
              className={cn(
                "h-6 w-6 transition-all group-hover:scale-110 sm:h-8 sm:w-8",
                isActive ? "text-pink-400" : "text-pink-400/50"
              )}
              fill={`rgba(244, 114, 182, ${heartFill})`}
              stroke="currentColor"
              strokeWidth={2}
            />
            {isActive && (
              <div className="absolute inset-0 animate-ping">
                <Heart className="h-6 w-6 text-pink-400/30 sm:h-8 sm:w-8" />
              </div>
            )}
          </div>
        </div>

        {/* Relationship Type */}
        <p className="mb-2 line-clamp-1 text-xs text-white/70 sm:mb-3 sm:text-sm">
          {formatRelationshipType(relationship.relationship_type)}
          {relationship.exclusivity_status && ` · ${relationship.exclusivity_status}`}
        </p>

        {(filterNote || relationship.character_sex) && (
          <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-white/45 sm:mb-3 sm:text-[11px]">
            {relationship.character_sex && relationship.character_sex !== 'unknown' ? `Sex: ${relationship.character_sex}` : null}
            {relationship.character_sex && relationship.character_sex !== 'unknown' && filterNote ? ' · ' : null}
            {filterNote}
          </p>
        )}

        {(cardTeaser) && (
          <p className="mb-2 line-clamp-2 border-l-2 border-purple-500/30 pl-2 text-[10px] leading-relaxed text-white/45 sm:mb-3 sm:text-[11px]">
            {cardTeaser}
          </p>
        )}

        {/* Still Learning — not enough evidence to score honestly yet */}
        {stillLearning ? (
          <div className="mb-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-2.5 py-2 sm:mb-3 sm:px-3 sm:py-2.5">
            <p className="text-[11px] font-medium text-white/55 sm:text-xs">Still learning</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] text-white/35 sm:text-[11px]">
              Mention {relationship.person_name?.split(' ')[0] || 'them'} more in chat — scores sharpen as evidence grows.
            </p>
          </div>
        ) : (
        <>
        {/* Attachment + fixation signals (only when we have real signals) */}
        {sig && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:mb-3 sm:gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-pink-500/25 bg-pink-500/10 text-pink-200">
              Attachment: {attachmentLabel}
            </span>
            {obsession >= 0.6 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Fixation signal
              </span>
            )}
          </div>
        )}

        {/* Quick Stats */}
        <div className="mb-2 grid grid-cols-2 gap-2 sm:mb-3 sm:gap-3">
          <div>
            <p className="mb-0.5 text-[10px] text-white/50 sm:mb-1 sm:text-xs">Compatibility</p>
            <div className="flex items-center gap-1">
              <p className={cn("text-xs font-semibold sm:text-sm", getScoreColor(relationship.compatibility_score))}>
                {Math.round(relationship.compatibility_score * 100)}%
              </p>
              {relationship.compatibility_score >= 0.7 ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : relationship.compatibility_score < 0.4 ? (
                <TrendingDown className="w-3 h-3 text-red-400" />
              ) : (
                <Minus className="w-3 h-3 text-yellow-400" />
              )}
            </div>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] text-white/50 sm:mb-1 sm:text-xs">Health</p>
            <div className="flex items-center gap-1">
              <p className={cn("text-xs font-semibold sm:text-sm", getScoreColor(relationship.relationship_health))}>
                {Math.round(relationship.relationship_health * 100)}%
              </p>
              {relationship.relationship_health >= 0.7 ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : relationship.relationship_health < 0.4 ? (
                <TrendingDown className="w-3 h-3 text-red-400" />
              ) : (
                <Minus className="w-3 h-3 text-yellow-400" />
              )}
            </div>
          </div>
        </div>
        </>
        )}

        {/* Duration */}
        {relationship.start_date && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/60 sm:mb-3 sm:gap-2 sm:text-xs">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span>{getDuration()}</span>
            {relationship.start_date && (
              <span className="text-white/40">
                · {new Date(relationship.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}

        {/* Flags Summary */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[10px] sm:gap-4 sm:text-xs">
          {relationship.red_flags.length > 0 && (
            <div className="flex items-center gap-1 text-red-300">
              <AlertTriangle className="w-3 h-3" />
              <span>{relationship.red_flags.length}</span>
            </div>
          )}
          {relationship.green_flags.length > 0 && (
            <div className="flex items-center gap-1 text-green-300">
              <CheckCircle className="w-3 h-3" />
              <span>{relationship.green_flags.length}</span>
            </div>
          )}
          {relationship.pros.length > 0 && (
            <div className="flex items-center gap-1 text-green-400">
              <span className="text-white/50">Pros:</span>
              <span>{relationship.pros.length}</span>
            </div>
          )}
          {relationship.cons.length > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <span className="text-white/50">Cons:</span>
              <span>{relationship.cons.length}</span>
            </div>
          )}
        </div>

        {(onOpenCharacter || onLinkCharacter) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            {hasCharacterCard ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(event) => handleCardAction(event, onOpenCharacter)}
                className="h-7 border-cyan-500/30 bg-cyan-500/10 px-2 text-[10px] text-cyan-100 hover:bg-cyan-500/20"
              >
                <BookOpen className="mr-1 h-3 w-3" />
                Character card
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(event) => handleCardAction(event, onLinkCharacter)}
                disabled={linkBusy}
                className="h-7 border-pink-500/30 bg-pink-500/10 px-2 text-[10px] text-pink-100 hover:bg-pink-500/20"
              >
                <Link2 className="mr-1 h-3 w-3" />
                {linkBusy ? 'Linking...' : 'Link to Character Book'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import type { MouseEvent } from 'react';
import { shortDisplayName } from '../../lib/displayName';
import { Heart, AlertTriangle, CheckCircle, BookOpen, Link2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import {
  getRomanticDemoProfile,
  metricLabel,
  type DemoMetricKey,
} from '../../mocks/romanticDemoProfiles';
import { composeRomanticRelationshipBadgeLabel, humanizeRomanceToken } from '../../lib/romanticRelationshipLabel';
import { getRelationshipStatusClasses } from './relationshipStatusColors';

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
    reciprocity?: 'unknown' | 'user_interest_only' | 'other_interest_only' | 'possible_mutual' | 'mutual_interest';
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: 'low' | 'moderate' | 'high';
    };
  } & Record<string, unknown>;
};

function reciprocityLabel(relationship: RomanticRelationship): string | null {
  if (relationship.status.toLowerCase() === 'unrequited') return 'Unrequited';
  switch (relationship.metadata?.reciprocity) {
    case 'user_interest_only': return 'Your interest';
    case 'other_interest_only': return 'Their interest';
    case 'possible_mutual':
      return relationship.relationship_type.toLowerCase() === 'crush'
        ? 'Possible mutual crush'
        : 'Possible mutual interest';
    case 'mutual_interest': return 'Mutual interest';
    default: return null;
  }
}

interface RelationshipCardProps {
  relationship: RomanticRelationship;
  onClick?: () => void;
  onOpenCharacter?: (relationship: RomanticRelationship) => void;
  onLinkCharacter?: (relationship: RomanticRelationship) => void;
  linkBusy?: boolean;
  highlighted?: boolean;
}

function formatRelationshipType(type: string) {
  return humanizeRomanceToken(type);
}

function getScoreColor(score: number) {
  if (score >= 0.7) return 'text-green-400';
  if (score >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function pickMetricValue(key: DemoMetricKey, rel: RomanticRelationship): number | null {
  switch (key) {
    case 'affection':
      return rel.affection_score;
    case 'compatibility':
      return rel.compatibility_score;
    case 'health':
      return rel.relationship_health;
    case 'intensity':
      return rel.emotional_intensity;
  }
}

function getDuration(rel: RomanticRelationship): string | null {
  if (!rel.start_date) return null;
  const start = new Date(rel.start_date);
  const end = rel.end_date ? new Date(rel.end_date) : new Date();
  const diffDays = Math.max(1, Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
  const years = Math.floor(diffDays / 365);
  return `${years}y`;
}

/**
 * Compact Dating & Romance book card — one identity line, one story beat,
 * at most two scores. Detail lives in the modal, not repeated here.
 */
export const RelationshipCard = ({
  relationship,
  onClick,
  onOpenCharacter,
  onLinkCharacter,
  linkBusy,
  highlighted,
}: RelationshipCardProps) => {
  const demoProfile = getRomanticDemoProfile(relationship.id);
  const displayName =
    relationship.person_name || formatRelationshipType(relationship.relationship_type);
  const isActive = relationship.is_current && relationship.status === 'active';
  const sig = relationship.metadata?.signals;
  const stillLearning = sig?.signal_strength === 'low';
  const hasCharacterCard =
    relationship.person_type === 'character' || Boolean(relationship.character_id);

  const teaser =
    demoProfile?.headline ??
    (typeof relationship.metadata?.lexical_evidence === 'string'
      ? relationship.metadata.lexical_evidence
      : null);

  const badgeLabel = composeRomanticRelationshipBadgeLabel(relationship);

  const metricKeys: DemoMetricKey[] = (
    demoProfile?.primaryMetrics ?? (['compatibility', 'health'] as const)
  ).slice(0, 2);

  const metrics = metricKeys
    .map((key) => {
      const value = pickMetricValue(key, relationship);
      if (value == null || Number.isNaN(value)) return null;
      return { key, label: metricLabel(key), value };
    })
    .filter(Boolean) as Array<{ key: DemoMetricKey; label: string; value: number }>;

  const showFlags =
    demoProfile?.overviewEmphasis === 'flags' ||
    (relationship.red_flags?.length ?? 0) > 0 ||
    (relationship.green_flags?.length ?? 0) > 0;
  const duration = getDuration(relationship);
  const heartFill = Math.max(0.15, Math.min(1, relationship.affection_score || 0.4));
  const directionLabel = reciprocityLabel(relationship);

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
        'h-full border-border/50 bg-black/45 cursor-pointer transition-all duration-300 hover:border-pink-500/40 hover:bg-pink-950/10 group',
        isActive && 'border-pink-500/25',
        highlighted && 'animate-romantic-enter animate-romantic-glow border-pink-400/60 ring-2 ring-pink-400/40',
      )}
      onClick={onClick}
    >
      <CardContent className="flex h-full flex-col gap-2.5 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="truncate text-[15px] font-semibold text-white leading-tight group-hover:text-pink-200 transition-colors sm:text-base">
              {displayName}
            </h3>
            <Badge
              variant="outline"
              className={cn(
                'max-w-full truncate text-[10px] font-medium px-1.5 py-0',
                getRelationshipStatusClasses(relationship).className,
              )}
            >
              {badgeLabel}
            </Badge>
          </div>
          <Heart
            className={cn(
              'h-5 w-5 shrink-0 mt-0.5 transition-transform group-hover:scale-110 sm:h-6 sm:w-6',
              isActive ? 'text-pink-400' : 'text-pink-400/45',
            )}
            fill={`rgba(244, 114, 182, ${heartFill})`}
            stroke="currentColor"
            strokeWidth={2}
          />
        </div>

        {directionLabel && (
          <p
            className={cn(
              'w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium',
              relationship.metadata?.reciprocity === 'mutual_interest'
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                : relationship.metadata?.reciprocity === 'possible_mutual'
                  ? 'border-amber-300/25 bg-amber-300/10 text-amber-100'
                  : 'border-violet-300/20 bg-violet-300/10 text-violet-200',
            )}
            data-testid="relationship-reciprocity"
          >
            {directionLabel}
          </p>
        )}

        {teaser && (
          <p className="text-[12px] leading-snug text-white/55 line-clamp-2 sm:text-[13px]">
            {teaser}
          </p>
        )}

        {stillLearning ? (
          <p className="text-[11px] text-white/40" data-testid="scores-still-learning">
            Still learning — mention {shortDisplayName(relationship.person_name) || 'them'} more in chat
          </p>
        ) : metrics.length > 0 ? (
          <div className="flex items-baseline gap-3 tabular-nums">
            {metrics.map((m) => (
              <div key={m.key} className="min-w-0">
                <p className="text-[9px] uppercase tracking-wide text-white/35">{m.label}</p>
                <p className={cn('text-sm font-semibold leading-none mt-0.5', getScoreColor(m.value))}>
                  {Math.round(m.value * 100)}%
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/40" data-testid="scores-still-learning">
            Still learning — not enough evidence for scores yet
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[10px] text-white/40">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {duration && <span>{duration}</span>}
            {showFlags && (relationship.red_flags?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-red-300/90">
                <AlertTriangle className="h-3 w-3" />
                {relationship.red_flags.length}
              </span>
            )}
            {showFlags && (relationship.green_flags?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-green-300/90">
                <CheckCircle className="h-3 w-3" />
                {relationship.green_flags.length}
              </span>
            )}
            {relationship.rank_among_active != null && relationship.rank_among_active <= 3 && (
              <span className="text-amber-300/80">#{relationship.rank_among_active}</span>
            )}
          </div>

          {(onOpenCharacter || onLinkCharacter) && (
            hasCharacterCard ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(event) => handleCardAction(event, onOpenCharacter)}
                className="h-6 px-1.5 text-[10px] text-cyan-200/80 hover:text-cyan-100 hover:bg-cyan-500/10"
                aria-label="Open Character Book card"
              >
                <BookOpen className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(event) => handleCardAction(event, onLinkCharacter)}
                disabled={linkBusy}
                className="h-6 px-1.5 text-[10px] text-pink-200/80 hover:text-pink-100 hover:bg-pink-500/10"
                aria-label={linkBusy ? 'Linking to Character Book' : 'Link to Character Book'}
              >
                <Link2 className="h-3 w-3" />
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
};

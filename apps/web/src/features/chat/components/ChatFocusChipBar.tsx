import { useEffect, useRef, useState } from 'react';
import { Heart, MapPin, Briefcase, Users, Sparkles, X, TrendingUp } from 'lucide-react';

import type { ChatFocus } from '../../../types/chatFocus';
import { useMockData } from '../../../contexts/MockDataContext';
import { chipColorForEntity } from '../../../lib/entityTypeColors';
import { CompactEntityChip, CompactChipStrip } from './CompactEntityChip';

const SURFACE_ICONS: Partial<Record<ChatFocus['sourceSurface'], typeof Heart>> = {
  love: Heart,
  characters: Sparkles,
  locations: MapPin,
  projects: Briefcase,
  organizations: Users,
};

const ARRIVAL_GLOW_MS = 2800;

type Props = {
  focus: ChatFocus;
  onDismiss: () => void;
};

export function ChatFocusChipBar({ focus, onDismiss }: Props) {
  const { runtimeDataMode } = useMockData();
  const isDemo = runtimeDataMode === 'DEMO';
  const Icon = SURFACE_ICONS[focus.sourceSurface] ?? Sparkles;
  const stats = focus.sessionStats;
  const isLove = focus.sourceSurface === 'love';
  const [isArriving, setIsArriving] = useState(false);
  const [statBump, setStatBump] = useState(false);
  const prevBumpKey = useRef(focus.statBumpKey ?? 0);

  useEffect(() => {
    if (!focus.arrivedAt) return;
    const age = Date.now() - focus.arrivedAt;
    if (age < ARRIVAL_GLOW_MS) {
      setIsArriving(true);
      const remaining = ARRIVAL_GLOW_MS - age;
      const timer = window.setTimeout(() => setIsArriving(false), remaining);
      return () => window.clearTimeout(timer);
    }
    setIsArriving(false);
  }, [focus.arrivedAt, focus.entityId, focus.sourceSurface]);

  useEffect(() => {
    const key = focus.statBumpKey ?? 0;
    if (key > prevBumpKey.current && key > 0) {
      setStatBump(true);
      const timer = window.setTimeout(() => setStatBump(false), 500);
      prevBumpKey.current = key;
      return () => window.clearTimeout(timer);
    }
    prevBumpKey.current = key;
  }, [focus.statBumpKey]);

  const baselineAffection = focus.baseline?.affectionScore;
  const projectedAffection =
    baselineAffection != null
      ? Math.min(100, Math.round(baselineAffection + stats.affectionDelta))
      : null;

  const focusChipClass = isLove
    ? `${chipColorForEntity({ type: 'character', characterVariant: 'romantic', status: 'confirmed' })} max-w-[160px] sm:max-w-[200px] ${isArriving ? 'animate-romantic-glow ring-1 ring-rose-500/30' : ''}`
    : `${chipColorForEntity({ type: 'character', status: 'confirmed' })} max-w-[160px] sm:max-w-[200px] ${isArriving ? 'ring-1 ring-violet-500/25' : ''}`;

  return (
    <div
      className={`mx-3 sm:mx-4 lg:mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mb-1 px-0 ${isArriving && isLove ? 'animate-romantic-enter' : isArriving ? 'animate-chat-focus-enter' : ''}`}
      data-testid="chat-focus-chip-bar"
    >
      <CompactChipStrip label="Focus">
        <CompactEntityChip
          className={`${focusChipClass} max-w-[160px] sm:max-w-[200px]`}
          title={[focus.entityName, focus.sourceLabel, focus.knowledgeScope].filter(Boolean).join(' · ')}
        >
          <Icon className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
          <span className="truncate">{focus.entityName}</span>
          <span className="text-white/35">·</span>
          <span className="truncate opacity-80">{focus.sourceLabel}</span>
        </CompactEntityChip>

        {isDemo && (
          <CompactEntityChip className="border-amber-500/35 bg-amber-500/10 text-amber-200/90 max-w-none">
            Demo
          </CompactEntityChip>
        )}

        {projectedAffection != null && (
          <CompactEntityChip
            className={`max-w-none tabular-nums ${
              isLove ? 'border-pink-500/25 bg-pink-500/5 text-pink-200/80' : 'border-white/10 bg-white/[0.04] text-white/55'
            }`}
          >
            ~{projectedAffection}%
            {stats.affectionDelta > 0 && (
              <span className="text-emerald-300/80">+{stats.affectionDelta.toFixed(0)}</span>
            )}
          </CompactEntityChip>
        )}

        {stats.messagesSent > 0 && stats.connectionDelta > 0 && (
          <CompactEntityChip
            className={`max-w-none tabular-nums ${statBump ? 'animate-stat-bump' : ''} ${
              isLove
                ? 'border-pink-500/25 bg-pink-500/10 text-pink-200'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            <TrendingUp className="h-2.5 w-2.5" aria-hidden />
            +{stats.connectionDelta}
          </CompactEntityChip>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 touch-manipulation"
          aria-label="Clear chat focus"
        >
          <X className="h-3 w-3" />
        </button>
      </CompactChipStrip>
    </div>
  );
}

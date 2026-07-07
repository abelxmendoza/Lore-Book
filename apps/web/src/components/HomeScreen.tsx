// HomeScreen — Sprint W: Home Experience Consolidation
//
// Answers five questions for a returning user, in order:
//   1. Who you are right now      → LivingBiographyCard
//   2. What changed recently       → WhatChangedHomeCard (localStorage-gated)
//   3. Who matters most            → Top characters by importance_score
//   4. What you're working toward  → Top active quests
//   5. How you're growing          → Top skills by level
//
// Uses existing backend APIs and refreshes visible dashboard data.

import {
  Sparkles, X, Users, Target, TrendingUp,
  MessageSquareText, ArrowRight, ChevronRight,
  Clock, Zap, Star, BookOpen,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchCharacterList } from '../api/characterList';
import { skillsApi } from '../api/skills';
import { fetchWhatChanged } from '../api/whatChanged';
import { useRecentChatThreads } from '../contexts/ChatThreadContext';
import { XConnectionPanel } from '../features/integrations/XConnectionPanel';
import { useAccountAuthority } from '../hooks/useAccountAuthority';
import { useQuestBoard } from '../hooks/useQuests';
import { useShouldUseMockData } from '../hooks/useShouldUseMockData';
import { useVisiblePolling } from '../hooks/useVisiblePolling';
import { apiCache } from '../lib/cache';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/supabase';
import type { Quest } from '../types/quest';
import type { Skill } from '../types/skill';

import { LivingBiographyCard } from './biography/LivingBiographyCard';
import { CareerHomeCard } from './career/CareerHomeCard';
import type { Character } from './characters/CharacterProfileCard';


// ─── Constants ────────────────────────────────────────────────────────────────

const LAST_VISIT_KEY = 'lk_home_last_visit_';
const MIN_GAP_HOURS  = 20;
const MAX_GAP_HOURS  = 24 * 60; // 60 days
const HOME_REFRESH_INTERVAL_MS = 60_000;

const HOME_CACHE_PATTERNS = [
  /\/api\/books\/characters(?:\?|:|$)/,
  /\/api\/books\/skills(?:\?|:|$)/,
  /\/api\/skills(?:\?|:|$)/,
  /\/api\/quests\/board(?:\?|:|$)/,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function gapLabel(gapDays: number) {
  if (gapDays < 1.5) return 'since yesterday';
  if (gapDays < 2.5) return 'since 2 days ago';
  return `over the last ${Math.round(gapDays)} days`;
}

/** Read previous home-visit timestamp; atomically write the new one. */
function getAndRefreshLastVisit(userId: string): string | null {
  const key = `${LAST_VISIT_KEY}${userId}`;
  const prev = localStorage.getItem(key);
  localStorage.setItem(key, new Date().toISOString());
  return prev;
}

function invalidateHomeCaches(): void {
  HOME_CACHE_PATTERNS.forEach((pattern) => apiCache.deletePattern(pattern));
}

function uniqueCharactersForHome(characters: Character[]): Character[] {
  const byName = new Map<string, Character>();
  for (const character of characters) {
    const key = character.name?.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (character.importance_score ?? 0) > (existing.importance_score ?? 0)) {
      byName.set(key, character);
    }
  }
  return [...byName.values()];
}

// ─── WhatChangedHomeCard ──────────────────────────────────────────────────────
// Adapted from WhatChangedSinceLastTime but keyed off home-visit timestamp
// instead of a specific chat thread.

const WhatChangedHomeCard = ({ userId }: { userId: string }) => {
  const [lines, setLines]       = useState<string[] | null>(null);
  const [days,  setDays]        = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const since = getAndRefreshLastVisit(userId);
    if (!since) return; // first visit — nothing to compare against

    const gapHours = (Date.now() - new Date(since).getTime()) / 3_600_000;
    if (gapHours < MIN_GAP_HOURS || gapHours > MAX_GAP_HOURS) return;

    fetchWhatChanged(since)
      .then(({ summary, lines: serverLines }) => {
        if (!summary.hasChanges || !serverLines.length) return;
        setLines(serverLines);
        setDays(summary.gapDays);
      })
      .catch(() => {});
  }, [userId]);

  if (!lines || lines.length === 0 || dismissed) return null;

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950/40 via-black/20 to-indigo-950/10 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex-shrink-0 rounded-full bg-indigo-500/20 p-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300/80 mb-1.5">
              While you were away {gapLabel(days ?? 1)}
            </p>
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/75 leading-snug">
                  <span className="text-indigo-400/60 mt-0.5 flex-shrink-0">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ─── SectionHeader ────────────────────────────────────────────────────────────

const SectionHeader = ({
  icon: Icon,
  label,
  route,
  iconCls,
}: {
  icon: React.ElementType;
  label: string;
  route: string;
  iconCls: string;
}) => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', iconCls)} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => navigate(route)}
        className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-0.5"
      >
        See all <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
};

// ─── CharacterRow ─────────────────────────────────────────────────────────────

const CharacterRow = ({ char, onClick }: { char: Character; onClick: () => void }) => {
  const trend = char.analytics?.trend;
  const score = char.importance_score ?? char.analytics?.importance_score ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 hover:border-pink-500/30 hover:bg-pink-500/5 px-3 py-2.5 text-left transition-all duration-200"
    >
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white/70">
        {char.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate group-hover:text-pink-200 transition-colors">
          {char.name}
        </p>
        {char.role && (
          <p className="text-xs text-white/35 truncate">{char.role}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {score > 0 && (
          <span className="text-[10px] text-pink-400/70">{Math.round(score)}%</span>
        )}
        {trend === 'deepening' && <TrendingUp className="h-3 w-3 text-green-400" />}
        {trend === 'weakening' && <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />}
        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-pink-400 transition-colors" />
      </div>
    </button>
  );
};

// ─── QuestRow ─────────────────────────────────────────────────────────────────

const QuestRow = ({ quest, onClick }: { quest: Quest; onClick: () => void }) => {
  const pct = quest.progress_percentage ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-white/5 bg-black/20 hover:border-amber-500/30 hover:bg-amber-500/5 px-3 py-2.5 text-left transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-white group-hover:text-amber-200 transition-colors line-clamp-1">
          {quest.title}
        </p>
        <span className="text-[10px] text-amber-400/70 flex-shrink-0">{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400/80 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {quest.quest_type && (
        <p className="text-[10px] text-white/30 mt-1 capitalize">{quest.quest_type} quest</p>
      )}
    </button>
  );
};

// ─── SkillRow ─────────────────────────────────────────────────────────────────

const SKILL_LEVEL_MAX = 10;

const SkillRow = ({ skill, onClick }: { skill: Skill; onClick: () => void }) => {
  const pct = Math.round((skill.current_level / SKILL_LEVEL_MAX) * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-white/5 bg-black/20 hover:border-emerald-500/30 hover:bg-emerald-500/5 px-3 py-2.5 text-left transition-all duration-200"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-white group-hover:text-emerald-200 transition-colors truncate">
          {skill.skill_name}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Star className="h-3 w-3 text-emerald-400/70" />
          <span className="text-[10px] text-emerald-400/80 font-medium">Lvl {skill.current_level}</span>
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/80 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {skill.skill_category && (
        <p className="text-[10px] text-white/30 mt-1 capitalize">{skill.skill_category}</p>
      )}
    </button>
  );
};

// ─── EmptySlot ────────────────────────────────────────────────────────────────

const EmptySlot = ({ label }: { label: string }) => (
  <div className="rounded-xl border border-dashed border-white/8 px-3 py-4 text-center">
    <p className="text-xs text-white/25">{label}</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const HomeScreen = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const recentThreads = useRecentChatThreads(3);
  const isMock = useShouldUseMockData();
  // X panel on Home: demo mode always (panel self-mocks), real accounts only
  // with server-driven admin authority.
  const { authority } = useAccountAuthority();
  const showXPanel = isMock || authority?.canAccessAdmin === true;

  const userId = user?.id ?? '';
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';

  // ── Data state ─────────────────────────────────────────────────────────────
  const [topChars,       setTopChars]       = useState<Character[]>([]);
  const [topSkills,      setTopSkills]      = useState<Skill[]>([]);
  const refreshSeq = useRef(0);

  const { data: board, refetch: refetchQuestBoard } = useQuestBoard();

  // Top 3 active quests — main quests first, then side quests
  const topQuests = useMemo<Quest[]>(() => {
    if (!board) return [];
    const active = [
      ...(board.main_quests  ?? []).filter((q: Quest) => q.status === 'active'),
      ...(board.side_quests  ?? []).filter((q: Quest) => q.status === 'active'),
    ];
    return active.slice(0, 3);
  }, [board]);

  const refreshHomeData = useCallback((forceServerRefresh = false) => {
    if (forceServerRefresh) invalidateHomeCaches();

    const seq = ++refreshSeq.current;

    void fetchCharacterList<Character>()
      .then((characters) => {
        if (seq !== refreshSeq.current) return;
        const sorted = uniqueCharactersForHome(characters)
          .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));
        setTopChars(sorted.slice(0, 3));
      })
      .catch(() => {});

    void skillsApi.getSkills({ active_only: true })
      .then(skills => {
        if (seq !== refreshSeq.current) return;
        const sorted = [...skills]
          .sort((a, b) => b.current_level - a.current_level);
        setTopSkills(sorted.slice(0, 3));
      })
      .catch(() => {});

    if (forceServerRefresh) {
      void refetchQuestBoard?.();
    }
  }, [refetchQuestBoard]);

  // Keep dashboard panels tied to backend state while the home screen is open.
  useVisiblePolling(
    () => refreshHomeData(true),
    HOME_REFRESH_INTERVAL_MS,
    { immediate: true, runOnVisible: true },
  );

  useEffect(() => {
    const refreshOnFocus = () => refreshHomeData(true);
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [refreshHomeData]);

  // ── Derived display flags ──────────────────────────────────────────────────
  const hasChars  = topChars.length  > 0;
  const hasQuests = topQuests.length > 0;
  const hasSkills = topSkills.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 space-y-6">

        {/* ── 1. Compact greeting header ──────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
              {getGreeting()},{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                {displayName}
              </span>
            </h1>
            <p className="text-sm text-white/35 mt-0.5">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="New chat"
            className="flex shrink-0 items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:border-purple-500/60 hover:bg-purple-500/20 px-3 py-2 sm:px-4 text-sm font-medium text-purple-300 transition-all touch-manipulation"
          >
            <MessageSquareText className="h-4 w-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>

        {/* ── 2. What Changed Since Last Time ─────────────────────────────── */}
        {userId && <WhatChangedHomeCard userId={userId} />}

        {/* ── 3. Who you are right now — Living Biography (hero) ──────────── */}
        <LivingBiographyCard />

        {/* ── 3b. Career — resume-sourced job history ─────────────────────── */}
        <CareerHomeCard />

        {/* ── X Integration — full panel (connect, sync receipt, lore intake
               modes). Admin accounts get the real connection; demo mode gets
               the panel's built-in mock state so the feature is explorable. ── */}
        {showXPanel && <XConnectionPanel />}

        {/* ── 4–6. Three panels: People · Quests · Skills ─────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ── Who Matters Most ──────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
            <SectionHeader
              icon={Users}
              label="Who matters most"
              route="/characters"
              iconCls="text-pink-400"
            />
            <div className="space-y-2">
              {hasChars ? (
                topChars.map(char => (
                  <CharacterRow
                    key={char.id}
                    char={char}
                    onClick={() => navigate('/characters')}
                  />
                ))
              ) : (
                <EmptySlot label="People will appear as you share your story" />
              )}
            </div>
          </div>

          {/* ── Working Toward ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
            <SectionHeader
              icon={Target}
              label="Working toward"
              route="/quests"
              iconCls="text-amber-400"
            />
            <div className="space-y-2">
              {hasQuests ? (
                topQuests.map(quest => (
                  <QuestRow
                    key={quest.id}
                    quest={quest}
                    onClick={() => navigate('/quests')}
                  />
                ))
              ) : (
                <EmptySlot label="Active quests will appear here" />
              )}
            </div>
          </div>

          {/* ── How You're Growing ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
            <SectionHeader
              icon={Zap}
              label="How you're growing"
              route="/skills"
              iconCls="text-emerald-400"
            />
            <div className="space-y-2">
              {hasSkills ? (
                topSkills.map(skill => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    onClick={() => navigate('/skills')}
                  />
                ))
              ) : (
                <EmptySlot label="Skills appear as LoreBook notices patterns" />
              )}
            </div>
          </div>
        </div>

        {/* ── 7. Recent conversations (secondary) ─────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-purple-400/70" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Recent conversations
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/chat')}
              className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-0.5"
            >
              All chats <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {recentThreads.length > 0 ? recentThreads.map(thread => (
              <button
                key={thread.id}
                type="button"
                onClick={() => navigate(`/chat/${thread.id}`)}
                className="group flex-1 rounded-xl border border-white/5 bg-black/20 hover:border-purple-500/30 hover:bg-purple-500/5 px-3 py-2.5 text-left transition-all duration-200"
              >
                <p className="text-sm font-medium text-white truncate group-hover:text-purple-200 transition-colors">
                  {thread.title}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3 text-white/25" />
                  <span className="text-xs text-white/30">{formatRelativeTime(thread.updatedAt)}</span>
                </div>
              </button>
            )) : (
              <div className="flex-1 rounded-xl border border-dashed border-white/8 px-3 py-4 text-center">
                <p className="text-xs text-white/25">No conversations yet</p>
              </div>
            )}

            {/* New chat CTA — always present */}
            <button
              type="button"
              onClick={() => navigate('/chat')}
              className="sm:w-40 rounded-xl border border-dashed border-purple-500/25 bg-purple-500/5 hover:border-purple-500/50 hover:bg-purple-500/10 px-3 py-2.5 text-center transition-all group"
            >
              <span className="text-sm text-purple-400/70 group-hover:text-purple-300 transition-colors flex items-center justify-center gap-1.5">
                <MessageSquareText className="h-3.5 w-3.5" />
                New chat
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

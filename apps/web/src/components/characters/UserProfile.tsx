import { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, Sparkles, AlertCircle } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useAuth } from '../../lib/supabase';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { useMockData } from '../../contexts/MockDataContext';
import { AIInsightModal } from './AIInsightModal';
import type { Character } from './CharacterProfileCard';

interface UserProfileProps {
  characters?: Character[];
}

type CharacterAttribute = {
  id: string;
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
};

// ─── Insight chips ────────────────────────────────────────────────────────────

const INSIGHT_CHIPS = [
  {
    key: 'storyOfSelf',
    label: 'Story',
    icon: BookOpen,
    getValue: (d: any) => d?.mode?.mode ?? null,
    color: 'text-primary border-primary/30 bg-primary/8',
  },
  {
    key: 'archetype',
    label: 'Archetype',
    icon: Sparkles,
    getValue: (d: any) => d?.profile?.dominant ?? null,
    color: 'text-violet-400 border-violet-400/30 bg-violet-400/8',
  },
  {
    key: 'growth',
    label: 'Growth',
    icon: TrendingUp,
    getValue: (d: any) => d?.trajectory ?? null,
    color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8',
  },
  {
    key: 'shadow',
    label: 'Shadow',
    icon: AlertCircle,
    getValue: (d: any) => d?.dominant_shadow ?? null,
    color: 'text-rose-400 border-rose-400/30 bg-rose-400/8',
  },
] as const;

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ENGINE: Record<string, any> = {
  storyOfSelf: { mode: { mode: 'Reflective' }, themes: [{ theme: 'Self-Discovery' }] },
  archetype:   { profile: { dominant: 'The Seeker', secondary: ['The Sage'] } },
  growth:      { trajectory: 'Ascending', velocity: 0.73 },
  shadow:      { dominant_shadow: 'The Perfectionist', projection: { recommended_focus: 'Self-compassion' } },
};

const MOCK_ATTRIBUTES: CharacterAttribute[] = [
  { id: 'a1', attributeType: 'occupation',          attributeValue: 'Creative professional', confidence: 0.89, isCurrent: true },
  { id: 'a2', attributeType: 'relationship_status',  attributeValue: 'In a relationship',    confidence: 0.92, isCurrent: true },
  { id: 'a3', attributeType: 'lifestyle_pattern',   attributeValue: 'Journaling',           confidence: 0.88, isCurrent: true },
];

// ─── Archetype chip colours ───────────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, string> = {
  ally:         'bg-blue-500/20 text-blue-300',
  family:       'bg-amber-500/20 text-amber-300',
  mentor:       'bg-purple-500/20 text-purple-300',
  romantic:     'bg-rose-500/20 text-rose-300',
  friend:       'bg-teal-500/20 text-teal-300',
  colleague:    'bg-slate-500/20 text-slate-300',
  collaborator: 'bg-indigo-500/20 text-indigo-300',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const UserProfile = ({ characters = [] }: UserProfileProps) => {
  const { user: authUser } = useAuth();
  const { useMockData: isMockEnabled } = useMockData();
  const { entries = [] } = useLoreKeeper();

  const [attributes,     setAttributes]     = useState<CharacterAttribute[]>([]);
  const [engineResults,  setEngineResults]  = useState<Record<string, any> | null>(null);
  const [userCharId,     setUserCharId]     = useState<string | null>(null);
  const [insightModal,   setInsightModal]   = useState<{ type: string; data: any } | null>(null);

  // ── Auth-derived display values ─────────────────────────────────────────────
  const displayName =
    authUser?.user_metadata?.full_name  ||
    authUser?.user_metadata?.name       ||
    authUser?.email?.split('@')[0]      ||
    'You';

  const avatarUrl =
    authUser?.user_metadata?.custom_avatar_url ||
    authUser?.user_metadata?.avatar_url        ||
    null;

  // ── Derived stats ───────────────────────────────────────────────────────────
  const writingStreak = (() => {
    const uniqueDates = Array.from(
      new Set(entries.map(e => e.date?.split('T')[0]).filter(Boolean))
    ).sort().reverse();
    let streak = 0;
    let cursor = new Date().toISOString().split('T')[0];
    for (const date of uniqueDates) {
      const diff = Math.floor(
        (new Date(cursor).getTime() - new Date(date).getTime()) / 86_400_000
      );
      if (diff === 0 || (streak === 0 && diff <= 1)) {
        streak++;
        cursor = new Date(new Date(date).getTime() - 86_400_000).toISOString().split('T')[0];
      } else break;
    }
    return streak;
  })();

  const activeSince = (() => {
    const valid = entries
      .map(e => new Date(e.date))
      .filter(d => !isNaN(d.getTime()));
    if (!valid.length) return null;
    return new Date(Math.min(...valid.map(d => d.getTime())))
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  })();

  // ── Load user character id from passed-in characters ───────────────────────
  useEffect(() => {
    if (isMockEnabled) { setUserCharId('mock-self'); return; }
    const self = characters.find(c =>
      c.metadata?.is_self === true  ||
      c.metadata?.is_user === true  ||
      c.name?.toLowerCase() === 'me' ||
      c.name?.toLowerCase() === 'myself'
    );
    if (self) setUserCharId(self.id);
  }, [characters, isMockEnabled]);

  // ── Load attributes ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setAttributes(MOCK_ATTRIBUTES); return; }
    if (!userCharId || userCharId === 'mock-self') return;
    fetchJson<{ attributes: CharacterAttribute[] }>(
      `/api/characters/${userCharId}/attributes?currentOnly=true`
    )
      .then(r => setAttributes(r.attributes || []))
      .catch(() => setAttributes([]));
  }, [userCharId, isMockEnabled]);

  // ── Load engine results ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setEngineResults(MOCK_ENGINE); return; }
    fetchJson<Record<string, any>>('/api/engine-runtime/summary/cached')
      .then(r => setEngineResults(r && Object.keys(r).length > 0 ? r : null))
      .catch(() => setEngineResults(null));
  }, [isMockEnabled]);

  // ── Derived display values ──────────────────────────────────────────────────
  const topPeople = [...characters]
    .filter(c => c.archetype !== 'place')
    .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
    .slice(0, 8);

  const attributeLine = attributes
    .filter(a => a.isCurrent && a.confidence > 0.7)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map(a => a.attributeValue)
    .join(' · ');

  const activeChips = INSIGHT_CHIPS.filter(
    chip => engineResults?.[chip.key] && chip.getValue(engineResults[chip.key])
  );

  const hasStats = characters.length > 0 || entries.length > 0 || writingStreak > 0 || activeSince;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-primary/8 to-purple-900/15 border border-primary/20 rounded-xl p-5 space-y-5">

      {/* ── Hero ── */}
      <div className="flex items-start gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-14 h-14 rounded-full object-cover border-2 border-primary/40 flex-shrink-0"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-primary">{initials(displayName)}</span>
          </div>
        )}

        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-white">{displayName}</h2>
            <span className="text-[10px] text-white/25 font-mono uppercase tracking-widest">you</span>
          </div>
          {attributeLine && (
            <p className="text-sm text-white/45 mt-0.5">{attributeLine}</p>
          )}
        </div>
      </div>

      {/* ── Stat strip ── */}
      {hasStats && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/45 border-t border-white/6 pt-4">
          {characters.length > 0 && (
            <span>
              <span className="text-white/80 font-medium">{characters.length}</span> people
            </span>
          )}
          {entries.length > 0 && (
            <span>
              <span className="text-white/80 font-medium">{entries.length}</span> memories
            </span>
          )}
          {writingStreak > 0 && (
            <span className="text-primary/80">
              <span className="font-medium">{writingStreak}</span>-day streak
            </span>
          )}
          {activeSince && (
            <span>since <span className="text-white/60">{activeSince}</span></span>
          )}
        </div>
      )}

      {/* ── People in your story ── */}
      {topPeople.length > 0 && (
        <div className="border-t border-white/6 pt-4">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
            People in your story
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topPeople.map(person => {
              const chipColor =
                ARCHETYPE_COLORS[person.archetype?.toLowerCase() ?? ''] ??
                'bg-white/10 text-white/50';
              return (
                <div
                  key={person.id}
                  title={person.role ?? person.archetype}
                  className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border border-white/8 bg-black/25"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${chipColor}`}
                  >
                    {initials(person.name)}
                  </div>
                  <span className="text-xs text-white/65 truncate max-w-[90px]">
                    {person.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── AI snapshot chips ── */}
      {activeChips.length > 0 && (
        <div className="border-t border-white/6 pt-4">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
            AI snapshot
          </p>
          <div className="flex flex-wrap gap-2">
            {activeChips.map(chip => {
              const Icon = chip.icon;
              const value = chip.getValue(engineResults![chip.key]);
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setInsightModal({ type: chip.key, data: engineResults![chip.key] })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-75 ${chip.color}`}
                >
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span>
                    {chip.label}:{' '}
                    <span className="font-bold">{value}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {insightModal && (
        <AIInsightModal
          isOpen
          onClose={() => setInsightModal(null)}
          engineType={insightModal.type as any}
          engineData={insightModal.data}
        />
      )}
    </div>
  );
};

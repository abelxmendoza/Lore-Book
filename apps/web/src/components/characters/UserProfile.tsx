import { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, Sparkles, AlertCircle, GitBranch, Brain, Activity, ChevronRight } from 'lucide-react';
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

type LifeArc = {
  id: string;
  title: string;
  arc_type: string;
  track?: string;
  confidence: number;
  is_active: boolean;
  emotional_arc?: string;
  dominant_emotion?: string;
};

const INSIGHT_CHIPS = [
  { key: 'storyOfSelf', label: 'Story',     icon: BookOpen,     getValue: (d: any) => d?.mode?.mode ?? null,         color: 'text-primary border-primary/30 bg-primary/8' },
  { key: 'archetype',   label: 'Archetype', icon: Sparkles,     getValue: (d: any) => d?.profile?.dominant ?? null,  color: 'text-violet-400 border-violet-400/30 bg-violet-400/8' },
  { key: 'growth',      label: 'Growth',    icon: TrendingUp,   getValue: (d: any) => d?.trajectory ?? null,         color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8' },
  { key: 'shadow',      label: 'Shadow',    icon: AlertCircle,  getValue: (d: any) => d?.dominant_shadow ?? null,    color: 'text-rose-400 border-rose-400/30 bg-rose-400/8' },
] as const;

const MOCK_ENGINE: Record<string, any> = {
  storyOfSelf: { mode: { mode: 'Reflective' } },
  archetype:   { profile: { dominant: 'The Seeker', secondary: ['The Sage'] } },
  growth:      { trajectory: 'Ascending', velocity: 0.73 },
  shadow:      { dominant_shadow: 'The Perfectionist' },
};

const MOCK_ARCS: LifeArc[] = [
  { id: 'a1', title: 'Career Transition Arc',    arc_type: 'work',      track: 'career',        confidence: 0.88, is_active: true, emotional_arc: 'building' },
  { id: 'a2', title: 'Creative Expansion Arc',   arc_type: 'creative',  track: 'creative',      confidence: 0.75, is_active: true, emotional_arc: 'building' },
  { id: 'a3', title: 'Relationship Recovery Arc', arc_type: 'personal', track: 'relationships', confidence: 0.71, is_active: true, emotional_arc: 'recovery' },
];

const EMOTIONAL_ARC_LABELS: Record<string, string> = {
  building:   '↑ Building',
  climax:     '⚡ Peak',
  resolution: '→ Resolving',
  grief:      '↓ Grief',
  recovery:   '↑ Recovery',
  neutral:    '— Stable',
};

const TRACK_COLORS: Record<string, string> = {
  career:        'text-orange-400',
  relationships: 'text-pink-400',
  creative:      'text-rose-400',
  health:        'text-teal-400',
  inner:         'text-violet-400',
  mixed:         'text-blue-400',
};

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export const UserProfile = ({ characters = [] }: UserProfileProps) => {
  const { user: authUser } = useAuth();
  const { useMockData: isMockEnabled } = useMockData();
  const { entries = [] } = useLoreKeeper();

  const [attributes,    setAttributes]    = useState<CharacterAttribute[]>([]);
  const [engineResults, setEngineResults] = useState<Record<string, any> | null>(null);
  const [userCharId,    setUserCharId]    = useState<string | null>(null);
  const [activeArcs,    setActiveArcs]    = useState<LifeArc[]>([]);
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);
  const [insightModal,  setInsightModal]  = useState<{ type: string; data: any } | null>(null);

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
  const recentEntries = entries.filter(e => {
    const d = new Date(e.date);
    return !isNaN(d.getTime()) && d >= new Date(Date.now() - 30 * 86_400_000);
  }).length;

  const activeSince = (() => {
    const valid = entries.map(e => new Date(e.date)).filter(d => !isNaN(d.getTime()));
    if (!valid.length) return null;
    return new Date(Math.min(...valid.map(d => d.getTime())))
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  })();

  // ── Load user character id ───────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setUserCharId('mock-self'); return; }
    const self = characters.find(c =>
      c.metadata?.is_self === true || c.metadata?.is_user === true ||
      c.name?.toLowerCase() === 'me' || c.name?.toLowerCase() === 'myself'
    );
    if (self) setUserCharId(self.id);
  }, [characters, isMockEnabled]);

  // ── Load attributes ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) {
      setAttributes([
        { id: 'a1', attributeType: 'occupation',         attributeValue: 'Creative professional', confidence: 0.89, isCurrent: true },
        { id: 'a2', attributeType: 'relationship_status', attributeValue: 'In a relationship',    confidence: 0.92, isCurrent: true },
      ]);
      return;
    }
    if (!userCharId || userCharId === 'mock-self') return;
    fetchJson<{ attributes: CharacterAttribute[] }>(`/api/characters/${userCharId}/attributes?currentOnly=true`)
      .then(r => setAttributes(r.attributes || []))
      .catch(() => {});
  }, [userCharId, isMockEnabled]);

  // ── Load engine summary ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setEngineResults(MOCK_ENGINE); return; }
    fetchJson<Record<string, any>>('/api/engine-runtime/summary/cached')
      .then(r => setEngineResults(r && Object.keys(r).length > 0 ? r : null))
      .catch(() => {});
  }, [isMockEnabled]);

  // ── Load active life arcs ───────────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setActiveArcs(MOCK_ARCS); return; }
    fetchJson<{ arcs?: LifeArc[]; life_arcs?: LifeArc[] }>('/api/life-arcs?is_active=true&limit=5')
      .then(r => setActiveArcs(r.arcs ?? r.life_arcs ?? []))
      .catch(() => {});
  }, [isMockEnabled]);

  // ── Load knowledge claims count ─────────────────────────────────────────────
  useEffect(() => {
    if (isMockEnabled) { setKnowledgeCount(14); return; }
    fetchJson<{ success: boolean; summary: { total: number; by_status: Record<string, number> } }>('/api/knowledge/summary')
      .then(r => { if (r.success) setKnowledgeCount(r.summary.by_status?.ACTIVE ?? r.summary.total ?? 0); })
      .catch(() => {});
  }, [isMockEnabled]);

  const attributeLine = attributes
    .filter(a => a.isCurrent && a.confidence > 0.7)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2)
    .map(a => a.attributeValue)
    .join(' · ');

  const primaryArc = activeArcs[0] ?? null;
  const additionalArcCount = Math.max(0, activeArcs.length - 1);

  const archetype = engineResults?.archetype && INSIGHT_CHIPS[1].getValue(engineResults.archetype);
  const shadow    = engineResults?.shadow    && INSIGHT_CHIPS[3].getValue(engineResults.shadow);
  const growth    = engineResults?.growth    && INSIGHT_CHIPS[2].getValue(engineResults.growth);

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/6 via-black/60 to-purple-900/10 overflow-hidden">

      {/* ── Top hero ── */}
      <div className="px-5 pt-5 pb-4 flex items-start gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName}
            className="w-14 h-14 rounded-full object-cover border-2 border-primary/40 flex-shrink-0"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-primary">{initials(displayName)}</span>
          </div>
        )}

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold text-white leading-tight">{displayName}</h2>
            <span className="text-[10px] text-white/25 font-mono uppercase tracking-widest">you</span>
          </div>
          {attributeLine && (
            <p className="text-xs text-white/45 mt-0.5">{attributeLine}</p>
          )}

          {/* Archetype / Shadow tension */}
          {(archetype || shadow) && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {archetype && (
                <button
                  type="button"
                  onClick={() => setInsightModal({ type: 'archetype', data: engineResults!.archetype })}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-violet-400/25 bg-violet-400/8 text-violet-300 hover:bg-violet-400/15 transition-colors"
                >
                  <Sparkles className="h-2.5 w-2.5" />{archetype}
                </button>
              )}
              {shadow && (
                <button
                  type="button"
                  onClick={() => setInsightModal({ type: 'shadow', data: engineResults!.shadow })}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-rose-400/25 bg-rose-400/8 text-rose-300 hover:bg-rose-400/15 transition-colors"
                >
                  <AlertCircle className="h-2.5 w-2.5" />{shadow}
                </button>
              )}
              {growth && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
                  <TrendingUp className="h-2.5 w-2.5" />{growth}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── CURRENTLY IN — focal point ── */}
      {primaryArc && (
        <div className="mx-4 mb-4 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-[9px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">Currently In</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch className={`h-3.5 w-3.5 flex-shrink-0 ${TRACK_COLORS[primaryArc.track ?? ''] ?? 'text-white/50'}`} />
              <span className="text-sm font-semibold text-white/90 truncate">{primaryArc.title}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {primaryArc.emotional_arc && (
                <span className="text-[10px] text-white/40">
                  {EMOTIONAL_ARC_LABELS[primaryArc.emotional_arc] ?? primaryArc.emotional_arc}
                </span>
              )}
              {additionalArcCount > 0 && (
                <span className="text-[10px] text-white/30">+{additionalArcCount} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stat strip ── */}
      <div className="px-4 pb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40 border-t border-white/6 pt-3">
        {characters.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-white/70 font-semibold">{characters.length}</span>
            <span>people</span>
          </div>
        )}
        {activeArcs.length > 0 && (
          <div className="flex items-center gap-1">
            <GitBranch className="h-3 w-3 text-white/30" />
            <span className="text-white/70 font-semibold">{activeArcs.length}</span>
            <span>active arc{activeArcs.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {knowledgeCount !== null && knowledgeCount > 0 && (
          <div className="flex items-center gap-1">
            <Brain className="h-3 w-3 text-indigo-400/60" />
            <span className="text-white/70 font-semibold">{knowledgeCount}</span>
            <span>knowledge claims</span>
          </div>
        )}
        {recentEntries > 0 && (
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-white/30" />
            <span className="text-white/70 font-semibold">{recentEntries}</span>
            <span>entries this month</span>
          </div>
        )}
        {activeSince && (
          <span>since <span className="text-white/55">{activeSince}</span></span>
        )}
      </div>

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

import { useNavigate } from 'react-router-dom';
import {
  Brain, Sparkles, Zap, Heart, Users, Activity,
  AlertCircle, ClipboardCheck, Clock, TrendingUp, Target, Database,
  HeartPulse, Ghost, MapPin, ArrowRight, BookOpen, CheckCircle2,
  CalendarDays, BarChart3,
} from 'lucide-react';
import { useDiscoverySummary } from '../../hooks/useDiscoverySummary';
import { ChatFirstViewHint } from '../ChatFirstViewHint';

// ─── Panel config ────────────────────────────────────────────────────────────

interface PanelConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  badgeKey?: 'pendingProposals' | 'openContradictions' | 'fadingMemories';
  accent: string;
}

const CORE_PANELS: PanelConfig[] = [
  {
    id: 'soul-profile',
    title: 'Soul Profile',
    description: 'Your essence, hopes, dreams, fears, strengths, and skills.',
    icon: Heart,
    route: '/discovery/soul-profile',
    accent: 'from-rose-600 to-pink-700',
  },
  {
    id: 'identity',
    title: 'Identity Pulse',
    description: 'Short-term identity shifts, drift, and emotional trajectory.',
    icon: Brain,
    route: '/discovery/identity',
    accent: 'from-violet-600 to-purple-700',
  },
  {
    id: 'relationships',
    title: 'Relationships',
    description: 'Relationship network, sentiment patterns, and attachment dynamics.',
    icon: Users,
    route: '/discovery/relationships',
    accent: 'from-blue-600 to-cyan-700',
  },
  {
    id: 'insights-predictions',
    title: 'Insights & Predictions',
    description: 'Correlations, loops, recurring patterns, and probabilistic forecasts.',
    icon: TrendingUp,
    route: '/discovery/insights-predictions',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    id: 'values-habits',
    title: 'Values & Habits',
    description: 'Declared values, active goals, behavioral patterns, and streaks.',
    icon: Target,
    route: '/discovery/values-habits',
    accent: 'from-emerald-600 to-teal-700',
  },
  {
    id: 'decisions',
    title: 'Decision Memory',
    description: 'Snapshots of decisions with full context, options, and reasoning.',
    icon: Clock,
    route: '/discovery/decisions',
    accent: 'from-sky-600 to-blue-700',
  },
  {
    id: 'life-arc',
    title: 'Recent Moments',
    description: 'A narrative view of what\'s been going on in your life lately.',
    icon: MapPin,
    route: '/discovery/life-arc',
    accent: 'from-indigo-600 to-violet-700',
  },
  {
    id: 'shadow',
    title: 'Shadow',
    description: 'Suppressed topics, negative loops, and inner archetypes.',
    icon: AlertCircle,
    route: '/discovery/shadow',
    accent: 'from-slate-600 to-zinc-700',
  },
  {
    id: 'xp',
    title: 'Skills & Progress',
    description: 'Your life XP, levels, streaks, and skill development.',
    icon: Zap,
    route: '/discovery/xp',
    accent: 'from-yellow-500 to-amber-600',
  },
  {
    id: 'reactions-resilience',
    title: 'Reactions & Resilience',
    description: 'Recovery patterns, resilience scores, and therapeutic reflection.',
    icon: HeartPulse,
    route: '/discovery/reactions-resilience',
    accent: 'from-pink-600 to-rose-700',
  },
  {
    id: 'activity',
    title: 'Activity Calendar',
    description: 'Your journaling heatmap — streaks, active days, and consistency over time.',
    icon: CalendarDays,
    route: '/discovery/activity',
    accent: 'from-emerald-600 to-green-700',
  },
  {
    id: 'life-stats',
    title: 'Life Stats',
    description: 'Total entries, words written, peak journaling hours, and weekly patterns.',
    icon: BarChart3,
    route: '/discovery/life-stats',
    accent: 'from-violet-600 to-purple-700',
  },
];

const DATA_CONTROL_PANELS: PanelConfig[] = [
  {
    id: 'memory-management',
    title: 'Memory Management',
    description: 'Time-aware, evidence-based memory with confidence scores.',
    icon: Database,
    route: '/discovery/memory-management',
    accent: 'from-purple-600 to-indigo-700',
  },
  {
    id: 'memory-review',
    title: 'Memory Review Queue',
    description: 'Review and approve memory proposals before they write to storage.',
    icon: ClipboardCheck,
    route: '/discovery/memory-review',
    badgeKey: 'pendingProposals',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    id: 'continuity',
    title: 'Continuity Intelligence',
    description: 'Detects conflicts, emotional arcs, identity drift, and repeating loops.',
    icon: Activity,
    route: '/discovery/continuity',
    accent: 'from-teal-600 to-cyan-700',
  },
  {
    id: 'correction-dashboard',
    title: 'Corrections & Pruning',
    description: 'Manage corrections, deprecated knowledge, and contradictions.',
    icon: AlertCircle,
    route: '/discovery/correction-dashboard',
    badgeKey: 'openContradictions',
    accent: 'from-red-600 to-rose-700',
  },
  {
    id: 'memory-fade',
    title: 'Memory Fade Index',
    description: 'Memories slipping away, ranked by accessibility score.',
    icon: Ghost,
    route: '/discovery/memory-fade',
    badgeKey: 'fadingMemories',
    accent: 'from-slate-500 to-zinc-600',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PanelCardProps {
  panel: PanelConfig;
  badgeCount: number;
}

const PanelCard = ({ panel, badgeCount }: PanelCardProps) => {
  const navigate = useNavigate();
  const Icon = panel.icon;
  const needsAttention = badgeCount > 0;

  return (
    <button
      type="button"
      onClick={() => navigate(panel.route)}
      className={`group text-left w-full p-4 sm:p-5 rounded-xl border transition-all duration-200 ${
        needsAttention
          ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10'
          : 'border-border/60 bg-black/40 hover:border-primary/50 hover:bg-primary/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 p-2 rounded-lg bg-gradient-to-br ${panel.accent} opacity-80 group-hover:opacity-100 transition-opacity`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-white truncate">{panel.title}</h3>
            {needsAttention && (
              <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{panel.description}</p>
        </div>
        <ArrowRight className="shrink-0 h-4 w-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all mt-0.5" />
      </div>
    </button>
  );
};

// ─── Overview dashboard strip (Phase 2) ──────────────────────────────────────

const OverviewDashboard = () => {
  const navigate = useNavigate();
  const { summary, loading } = useDiscoverySummary();

  const totalAttention =
    (summary?.pendingProposals ?? 0) +
    (summary?.openContradictions ?? 0);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 rounded-xl border border-border/40 bg-black/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      {/* Status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Current chapter */}
        <button
          type="button"
          onClick={() => navigate('/lorebook')}
          className="group col-span-2 sm:col-span-2 text-left p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 hover:bg-purple-500/10 transition-all"
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Current Chapter</span>
          </div>
          <p className="text-sm font-semibold text-white truncate">
            {summary?.currentChapter ?? 'No chapter yet — start journaling'}
          </p>
          <p className="text-xs text-purple-400/70 mt-1 group-hover:text-purple-300 transition-colors">
            Generate Lorebook →
          </p>
        </button>

        {/* Pending reviews */}
        <button
          type="button"
          onClick={() => navigate('/discovery/memory-review')}
          className={`text-left p-4 rounded-xl border transition-all ${
            (summary?.pendingProposals ?? 0) > 0
              ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60'
              : 'border-border/40 bg-black/30 hover:border-border/60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Review Queue</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {summary?.pendingProposals ?? 0}
          </p>
          <p className="text-xs text-white/40 mt-0.5">pending proposals</p>
        </button>

        {/* Open contradictions */}
        <button
          type="button"
          onClick={() => navigate('/discovery/correction-dashboard')}
          className={`text-left p-4 rounded-xl border transition-all ${
            (summary?.openContradictions ?? 0) > 0
              ? 'border-red-500/40 bg-red-500/5 hover:border-red-500/60'
              : 'border-border/40 bg-black/30 hover:border-border/60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Contradictions</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {summary?.openContradictions ?? 0}
          </p>
          <p className="text-xs text-white/40 mt-0.5">unresolved</p>
        </button>
      </div>

      {/* Top insight */}
      {summary?.topInsight && (
        <button
          type="button"
          onClick={() => navigate('/discovery/insights-predictions')}
          className="group w-full text-left p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30 hover:bg-amber-500/8 transition-all"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="shrink-0 h-4 w-4 text-amber-400 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-amber-400/70 uppercase tracking-wider font-mono">Latest Insight</span>
              <p className="text-sm text-white/80 mt-1 line-clamp-2">{summary.topInsight}</p>
            </div>
            <ArrowRight className="shrink-0 h-4 w-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all mt-0.5" />
          </div>
        </button>
      )}

      {/* All-clear state */}
      {totalAttention === 0 && !summary?.topInsight && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400/80">Everything looks good — no pending reviews or contradictions.</p>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const DiscoveryOverview = () => {
  const { summary } = useDiscoverySummary();

  const getBadgeCount = (key?: PanelConfig['badgeKey']): number => {
    if (!key || !summary) return 0;
    return summary[key] ?? 0;
  };

  const renderGrid = (panels: PanelConfig[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {panels.map(panel => (
        <PanelCard
          key={panel.id}
          panel={panel}
          badgeCount={getBadgeCount(panel.badgeKey)}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8" data-testid="discovery-overview">
      <ChatFirstViewHint />

      {/* Live overview dashboard */}
      <OverviewDashboard />

      {/* Section 1 — Insights */}
      <section className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Insights about you</h1>
          <p className="text-sm text-white/50 mt-0.5">Panels that answer questions about your life and patterns.</p>
        </div>
        {renderGrid(CORE_PANELS)}
      </section>

      {/* Section 2 — Data & Control */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-white/70">Data & Control</h2>
          <p className="text-sm text-white/40">Transparency and control over memory, corrections, and entities.</p>
        </div>
        {renderGrid(DATA_CONTROL_PANELS)}
      </section>
    </div>
  );
};

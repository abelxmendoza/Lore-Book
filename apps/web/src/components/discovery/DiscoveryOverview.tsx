import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, BookOpen, CheckCircle2,
  ClipboardCheck, AlertCircle, MessageSquare, ChevronRight,
} from 'lucide-react';
import { useDiscoverySummary } from '../../hooks/useDiscoverySummary';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import {
  DATA_CONTROL_PANELS,
  INSIGHT_PANELS,
  type DiscoveryBadgeKey,
  type DiscoveryPanelDef,
} from './discoveryPanelRegistry';

interface PanelCardProps {
  panel: DiscoveryPanelDef;
  badgeCount: number;
  compact?: boolean;
}

const PanelCard = ({ panel, badgeCount, compact }: PanelCardProps) => {
  const navigate = useNavigate();
  const Icon = panel.icon;
  const needsAttention = badgeCount > 0;

  if (compact) {
    return (
      <button
        type="button"
        aria-label={panel.title}
        onClick={() => navigate(panel.path)}
        className={`group text-left w-full rounded-2xl border p-3.5 min-h-[118px] flex flex-col justify-between transition-all touch-manipulation active:scale-[0.98] ${
          needsAttention
            ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/12 via-amber-950/20 to-black/60 shadow-[0_0_24px_rgba(245,158,11,0.08)]'
            : 'border-white/10 bg-white/[0.04] backdrop-blur-sm hover:border-primary/35 active:border-primary/45'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className={`p-2 rounded-xl bg-gradient-to-br ${panel.accent} shadow-lg ring-1 ring-white/10`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          {needsAttention ? (
            <span className="text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-full px-2 py-0.5 tabular-nums">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 text-white/20 group-active:text-white/40 shrink-0 mt-0.5" />
          )}
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-white leading-snug line-clamp-2">
            {panel.shortTitle ?? panel.title}
          </h3>
          <p className="text-[11px] text-white/40 mt-1 line-clamp-2 leading-relaxed">{panel.description}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(panel.path)}
      className={`group text-left w-full p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${
        needsAttention
          ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/8 to-black/40 hover:border-amber-500/55 hover:shadow-[0_0_30px_rgba(245,158,11,0.1)]'
          : 'border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-primary/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 p-2.5 rounded-xl bg-gradient-to-br ${panel.accent} opacity-90 group-hover:opacity-100 transition-opacity shadow-md ring-1 ring-white/10`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-white truncate">{panel.title}</h3>
            {needsAttention && (
              <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{panel.description}</p>
        </div>
        <ArrowRight className="shrink-0 h-4 w-4 text-white/20 group-hover:text-primary/70 group-hover:translate-x-0.5 transition-all mt-0.5" />
      </div>
    </button>
  );
};

function SectionHeader({
  title,
  subtitle,
  count,
  accent = 'primary',
}: {
  title: string;
  subtitle?: string;
  count?: number;
  accent?: 'primary' | 'amber';
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base sm:text-xl font-bold text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs sm:text-sm text-white/45 mt-0.5">{subtitle}</p>}
      </div>
      {count !== undefined && (
        <span className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
          accent === 'amber'
            ? 'border-amber-500/30 text-amber-300/80 bg-amber-500/10'
            : 'border-primary/25 text-primary/80 bg-primary/10'
        }`}>
          {count} panels
        </span>
      )}
    </div>
  );
}

const OverviewDashboard = ({ mobile }: { mobile: boolean }) => {
  const navigate = useNavigate();
  const { summary, loading } = useDiscoverySummary();

  const totalAttention =
    (summary?.pendingProposals ?? 0) +
    (summary?.openContradictions ?? 0);

  if (loading) {
    return (
      <div className={`${mobile ? 'flex gap-3 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x scrollbar-none' : 'grid grid-cols-2 sm:grid-cols-4 gap-3'} mb-6`}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`${mobile ? 'snap-start shrink-0 w-[78vw] max-w-[300px]' : ''} h-[132px] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse`}
          />
        ))}
      </div>
    );
  }

  const statCard = (
    label: string,
    value: React.ReactNode,
    sub: string,
    icon: React.ReactNode,
    accentClass: string,
    onClick: () => void,
    alert?: boolean,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all touch-manipulation active:scale-[0.99] ${
        mobile ? 'snap-start shrink-0 w-[78vw] max-w-[300px] min-h-[132px]' : ''
      } ${
        alert
          ? `${accentClass} shadow-[0_0_20px_rgba(0,0,0,0.2)]`
          : 'border-white/10 bg-white/[0.04] backdrop-blur-sm hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="p-1.5 rounded-lg bg-black/30">{icon}</div>
        <span className="text-[10px] text-white/45 uppercase tracking-[0.12em] font-semibold">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white tabular-nums leading-none">{value}</div>
      <p className="text-xs text-white/40 mt-2">{sub}</p>
    </button>
  );

  return (
    <div className="mb-6 sm:mb-8 space-y-4">
      {/* Quick actions — mobile row */}
      {mobile && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-0.5 px-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="shrink-0 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 min-h-[44px] touch-manipulation active:bg-white/[0.08]"
          >
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-white/80">Chat</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/lorebook')}
            className="shrink-0 flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 min-h-[44px] touch-manipulation active:bg-purple-500/15"
          >
            <BookOpen className="h-4 w-4 text-purple-300" />
            <span className="text-xs font-semibold text-purple-200/90">LoreBooks</span>
          </button>
          {(summary?.pendingProposals ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate('/discovery/memory-review')}
              className="shrink-0 flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 min-h-[44px] touch-manipulation"
            >
              <ClipboardCheck className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-200/90">{summary?.pendingProposals} to review</span>
            </button>
          )}
        </div>
      )}

      <div className={`${mobile ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-0.5 px-0.5' : 'grid grid-cols-2 sm:grid-cols-4 gap-3'}`}>
        <button
          type="button"
          onClick={() => navigate('/lorebook')}
          className={`text-left rounded-2xl border border-purple-500/35 bg-gradient-to-br from-purple-600/20 via-violet-900/30 to-black/70 p-4 touch-manipulation active:scale-[0.99] shadow-[0_0_32px_rgba(139,92,246,0.12)] ${
            mobile ? 'snap-start shrink-0 w-[85vw] max-w-[320px]' : 'col-span-2 sm:col-span-2'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-purple-300" />
            <span className="text-[10px] text-purple-300/90 uppercase tracking-[0.12em] font-semibold">Current chapter</span>
          </div>
          <p className="text-base sm:text-lg font-bold text-white line-clamp-2 leading-snug">
            {summary?.currentChapter ?? 'No chapter yet — start journaling'}
          </p>
          <p className="text-xs text-purple-300/80 mt-2.5 font-medium inline-flex items-center gap-1">
            Generate Lorebook <ArrowRight className="h-3 w-3" />
          </p>
        </button>

        {statCard(
          'Review queue',
          summary?.pendingProposals ?? 0,
          'pending proposals',
          <ClipboardCheck className="h-4 w-4 text-amber-400" />,
          'border-amber-500/40 bg-gradient-to-br from-amber-500/12 to-black/50',
          () => navigate('/discovery/memory-review'),
          (summary?.pendingProposals ?? 0) > 0,
        )}

        {statCard(
          'Contradictions',
          summary?.openContradictions ?? 0,
          'unresolved',
          <AlertCircle className="h-4 w-4 text-red-400" />,
          'border-red-500/40 bg-gradient-to-br from-red-500/12 to-black/50',
          () => navigate('/discovery/correction-dashboard'),
          (summary?.openContradictions ?? 0) > 0,
        )}
      </div>

      {summary?.topInsight && (
        <button
          type="button"
          onClick={() => navigate('/discovery/insights-predictions')}
          className="w-full text-left rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/12 via-amber-950/10 to-transparent p-4 touch-manipulation active:scale-[0.99]"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-xl bg-amber-500/15 border border-amber-500/25">
              <Sparkles className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-amber-400/90 uppercase tracking-[0.12em] font-semibold">Latest insight</span>
              <p className="text-sm text-white/85 mt-1.5 line-clamp-3 leading-relaxed">{summary.topInsight}</p>
            </div>
            <ArrowRight className="shrink-0 h-4 w-4 text-white/25 mt-2" />
          </div>
        </button>
      )}

      {totalAttention === 0 && !summary?.topInsight && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08]">
          <div className="p-1.5 rounded-lg bg-emerald-500/15">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          </div>
          <p className="text-sm text-emerald-300/90">All clear — no pending reviews or contradictions.</p>
        </div>
      )}
    </div>
  );
};

export const DiscoveryOverview = () => {
  const isMobile = useIsMobile(1024);
  const { summary } = useDiscoverySummary();

  const getBadgeCount = (key?: DiscoveryBadgeKey): number => {
    if (!key || !summary) return 0;
    return summary[key] ?? 0;
  };

  const attentionCount = DATA_CONTROL_PANELS.reduce(
    (sum, p) => sum + getBadgeCount(p.badgeKey),
    0,
  );

  const renderGrid = (panels: DiscoveryPanelDef[]) => (
    <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
      {panels.map((panel) => (
        <PanelCard
          key={panel.id}
          panel={panel}
          badgeCount={getBadgeCount(panel.badgeKey)}
          compact={isMobile}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-7 sm:space-y-9 max-w-6xl mx-auto" data-testid="discovery-overview">
      {/* Desktop hero */}
      {!isMobile && (
        <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 via-violet-950/30 to-black/60 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-primary/70 font-semibold mb-2">Intelligence dashboard</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Discovery Hub</h1>
              <p className="text-sm text-white/50 mt-2 max-w-lg">
                Patterns, insights, and memory control — everything LoreBook has learned about your story.
              </p>
            </div>
            {attentionCount > 0 && (
              <span className="shrink-0 text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-full px-3 py-1.5">
                {attentionCount} need attention
              </span>
            )}
          </div>
        </header>
      )}

      {/* Mobile intro line — header shows title; this adds context */}
      {isMobile && (
        <p className="text-sm text-white/50 leading-relaxed -mt-1">
          Explore what LoreBook knows — patterns, people, and memory health at a glance.
        </p>
      )}

      <div className={isMobile ? 'hidden' : ''}>
        <ChatFirstViewHint />
      </div>

      <OverviewDashboard mobile={isMobile} />

      <section className="space-y-3.5">
        <SectionHeader
          title="Insights about you"
          subtitle={isMobile ? undefined : 'Panels that answer questions about your life and patterns.'}
          count={INSIGHT_PANELS.length}
        />
        {renderGrid(INSIGHT_PANELS)}
      </section>

      <section className="space-y-3.5">
        <SectionHeader
          title="Data & control"
          subtitle={isMobile ? undefined : 'Transparency and control over memory, corrections, and entities.'}
          count={DATA_CONTROL_PANELS.length}
          accent={attentionCount > 0 ? 'amber' : 'primary'}
        />
        {renderGrid(DATA_CONTROL_PANELS)}
      </section>
    </div>
  );
};

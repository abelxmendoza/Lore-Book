import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Compass,
  Sparkles,
  Shield,
  LayoutGrid,
  BookOpen,
  ChevronRight,
  Search,
} from 'lucide-react';
import { useDiscoverySummary } from '../../hooks/useDiscoverySummary';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import {
  DATA_CONTROL_PANELS,
  INSIGHT_PANELS,
  type DiscoveryBadgeKey,
  type DiscoveryPanelDef,
} from './discoveryPanelRegistry';

type SheetId = 'insights' | 'data' | 'all' | null;

function badgeCount(summary: ReturnType<typeof useDiscoverySummary>['summary'], key?: DiscoveryBadgeKey) {
  if (!key || !summary) return 0;
  return summary[key] ?? 0;
}

function PanelLink({
  panel,
  count,
  onNavigate,
}: {
  panel: DiscoveryPanelDef;
  count: number;
  onNavigate: () => void;
}) {
  const Icon = panel.icon;
  return (
    <Link
      to={panel.path}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3.5 min-h-[64px] active:bg-white/[0.08] touch-manipulation"
    >
      <div className={`shrink-0 p-2.5 rounded-xl bg-gradient-to-br ${panel.accent} ring-1 ring-white/10 shadow-md`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{panel.title}</p>
        <p className="text-[11px] text-white/45 line-clamp-1 mt-0.5">{panel.description}</p>
      </div>
      {count > 0 ? (
        <span className="shrink-0 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35 rounded-full px-2 py-0.5 tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 text-white/25 shrink-0" />
      )}
    </Link>
  );
}

function PanelSheet({
  open,
  title,
  panels,
  onClose,
  getCount,
  searchable = false,
}: {
  open: boolean;
  title: string;
  panels: DiscoveryPanelDef[];
  onClose: () => void;
  getCount: (key?: DiscoveryBadgeKey) => number;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return panels;
    const q = query.toLowerCase();
    return panels.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.shortTitle?.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [panels, query]);

  return (
    <MobileBottomSheet
      open={open}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={title}
    >
      {searchable && (
        <div className="relative mb-3 -mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search panels…"
            className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
          />
        </div>
      )}
      <div className="grid gap-2 pb-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-6">No panels match &ldquo;{query}&rdquo;</p>
        ) : (
          filtered.map((panel) => (
            <PanelLink
              key={panel.id}
              panel={panel}
              count={getCount(panel.badgeKey)}
              onNavigate={() => {
                setQuery('');
                onClose();
              }}
            />
          ))
        )}
      </div>
    </MobileBottomSheet>
  );
}

export const DiscoveryMobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { summary } = useDiscoverySummary();
  const [sheet, setSheet] = useState<SheetId>(null);

  const isOverview = location.pathname === '/discovery' || location.pathname === '/discovery/';
  const isInsightRoute = INSIGHT_PANELS.some((p) => location.pathname.startsWith(p.path));
  const isDataRoute = DATA_CONTROL_PANELS.some((p) => location.pathname.startsWith(p.path));

  const getCount = (key?: DiscoveryBadgeKey) => badgeCount(summary, key);
  const attention =
    getCount('pendingProposals') + getCount('openContradictions') + getCount('fadingMemories');

  const closeSheet = () => setSheet(null);

  const tabs: Array<{
    id: SheetId | 'home' | 'book';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    active: boolean;
    onClick: () => void;
    badge?: boolean;
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: Compass,
      active: isOverview,
      onClick: () => navigate('/discovery'),
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: Sparkles,
      active: isInsightRoute,
      onClick: () => setSheet('insights'),
    },
    {
      id: 'data',
      label: 'Data',
      icon: Shield,
      active: isDataRoute,
      onClick: () => setSheet('data'),
      badge: attention > 0,
    },
    {
      id: 'all',
      label: 'Browse',
      icon: LayoutGrid,
      active: false,
      onClick: () => setSheet('all'),
    },
    {
      id: 'book',
      label: 'Book',
      icon: BookOpen,
      active: false,
      onClick: () => navigate('/lorebook'),
    },
  ];

  return (
    <>
      <PanelSheet
        open={sheet === 'insights'}
        title="Insights about you"
        panels={INSIGHT_PANELS}
        onClose={closeSheet}
        getCount={getCount}
      />
      <PanelSheet
        open={sheet === 'data'}
        title="Data & control"
        panels={DATA_CONTROL_PANELS}
        onClose={closeSheet}
        getCount={getCount}
      />
      <PanelSheet
        open={sheet === 'all'}
        title="All panels"
        panels={[...INSIGHT_PANELS, ...DATA_CONTROL_PANELS]}
        onClose={closeSheet}
        getCount={getCount}
        searchable
      />

      <nav
        className="lg:hidden flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-xl z-20"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }}
        aria-label="Discovery navigation"
      >
        <div className="flex items-stretch px-1 pt-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isLink = tab.id === 'home';
            const inner = (
              <>
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                    tab.active ? 'bg-primary/20 text-primary' : 'text-white/45'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${tab.active ? 'drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : ''}`} />
                  {tab.badge && !tab.active && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-black" />
                  )}
                </div>
                <span className={`text-[10px] font-medium mt-0.5 ${tab.active ? 'text-primary' : 'text-white/40'}`}>
                  {tab.label}
                </span>
              </>
            );

            const className = `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 touch-manipulation transition-colors ${
              tab.active ? 'text-primary' : 'text-white/40 active:text-white/65'
            }`;

            if (isLink) {
              return (
                <Link
                  key={tab.id}
                  to="/discovery"
                  className={className}
                  aria-current={tab.active ? 'page' : undefined}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button key={tab.id} type="button" className={className} onClick={tab.onClick}>
                {inner}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

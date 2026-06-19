import { Link, useLocation } from 'react-router-dom';
import { Compass, BookOpen } from 'lucide-react';
import { useDiscoverySummary } from '../../hooks/useDiscoverySummary';
import {
  DATA_CONTROL_PANELS,
  INSIGHT_PANELS,
  type DiscoveryBadgeKey,
} from './discoveryPanelRegistry';

export const DiscoveryNav = () => {
  const location = useLocation();
  const { summary } = useDiscoverySummary();

  const isActive = (path: string) =>
    path === '/discovery'
      ? location.pathname === '/discovery'
      : location.pathname.startsWith(path);

  const getBadgeCount = (key?: DiscoveryBadgeKey): number => {
    if (!key || !summary) return 0;
    return summary[key] ?? 0;
  };

  const renderGroup = (label: string, panels: typeof INSIGHT_PANELS) => (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.14em] px-3 pt-4 pb-1.5">
        {label}
      </p>
      {panels.map((panel) => {
        const Icon = panel.icon;
        const active = isActive(panel.path);
        const count = getBadgeCount(panel.badgeKey);
        return (
          <Link
            key={panel.id}
            to={panel.path}
            className={`flex items-center gap-2.5 mx-1 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              active
                ? 'bg-primary/15 text-primary border border-primary/25 shadow-[0_0_20px_rgba(139,92,246,0.08)]'
                : 'text-white/55 hover:bg-white/[0.04] hover:text-white border border-transparent'
            }`}
          >
            <div className={`shrink-0 p-1.5 rounded-lg bg-gradient-to-br ${panel.accent} ${active ? 'opacity-100' : 'opacity-70'}`}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="flex-1 font-medium truncate">{panel.title}</span>
            {count > 0 && (
              <span className="shrink-0 text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside className="w-60 flex-shrink-0 border-r border-white/10 bg-black/30 backdrop-blur-sm flex flex-col py-3 overflow-y-auto">
      <Link
        to="/discovery"
        className={`flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors mb-1 ${
          isActive('/discovery') && location.pathname === '/discovery'
            ? 'bg-primary/15 text-primary border border-primary/25'
            : 'text-white/70 hover:bg-white/[0.04] hover:text-white border border-transparent'
        }`}
      >
        <Compass className="h-4 w-4 shrink-0" />
        <span>Overview</span>
      </Link>

      <Link
        to="/lorebook"
        className="flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-xl text-sm text-white/45 hover:text-white/75 hover:bg-white/[0.04] transition-colors mb-2 border border-transparent"
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        <span>Generate Lorebook</span>
      </Link>

      <div className="border-t border-white/8 mx-3" />

      <div className="flex-1 mt-1">
        {renderGroup('Insights', INSIGHT_PANELS)}
        <div className="border-t border-white/8 mx-3 my-2" />
        {renderGroup('Data & control', DATA_CONTROL_PANELS)}
      </div>
    </aside>
  );
};

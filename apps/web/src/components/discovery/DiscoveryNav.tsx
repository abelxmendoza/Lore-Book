import { Link, useLocation } from 'react-router-dom';
import {
  Compass, Heart, Brain, Users, TrendingUp, Target, Clock, MapPin,
  AlertCircle, Zap, HeartPulse, Database, ClipboardCheck, Activity,
  Ghost, BookOpen, CalendarDays, BarChart3, Trophy, ScrollText
} from 'lucide-react';
import { useDiscoverySummary } from '../../hooks/useDiscoverySummary';

interface NavPanel {
  id: string;
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'pendingProposals' | 'openContradictions' | 'fadingMemories';
}

const INSIGHTS_PANELS: NavPanel[] = [
  { id: 'soul-profile',         title: 'Soul Profile',            path: '/discovery/soul-profile',          icon: Heart },
  { id: 'identity',             title: 'Identity Pulse',          path: '/discovery/identity',              icon: Brain },
  { id: 'relationships',        title: 'Relationships',           path: '/discovery/relationships',         icon: Users },
  { id: 'insights-predictions', title: 'Insights & Predictions',  path: '/discovery/insights-predictions',  icon: TrendingUp },
  { id: 'values-habits',        title: 'Values & Habits',         path: '/discovery/values-habits',         icon: Target },
  { id: 'decisions',            title: 'Decision Memory',         path: '/discovery/decisions',             icon: Clock },
  { id: 'life-arc',             title: 'Recent Moments',          path: '/discovery/life-arc',              icon: MapPin },
  { id: 'shadow',               title: 'Shadow',                  path: '/discovery/shadow',                icon: AlertCircle },
  { id: 'xp',                   title: 'Skills & Progress',       path: '/discovery/xp',                   icon: Zap },
  { id: 'reactions-resilience', title: 'Reactions & Resilience',  path: '/discovery/reactions-resilience',  icon: HeartPulse },
  { id: 'activity',             title: 'Activity Calendar',        path: '/discovery/activity',              icon: CalendarDays },
  { id: 'life-stats',           title: 'Life Stats',               path: '/discovery/life-stats',            icon: BarChart3 },
  { id: 'achievements',         title: 'Achievements',             path: '/discovery/achievements',          icon: Trophy },
];

const DATA_CONTROL_PANELS: NavPanel[] = [
  { id: 'memory-management',    title: 'Memory Management',       path: '/discovery/memory-management',     icon: Database },
  { id: 'memory-review',        title: 'Memory Review Queue',     path: '/discovery/memory-review',         icon: ClipboardCheck,  badgeKey: 'pendingProposals' },
  { id: 'continuity',           title: 'Continuity',              path: '/discovery/continuity',            icon: Activity },
  { id: 'correction-dashboard', title: 'Corrections & Pruning',   path: '/discovery/correction-dashboard',  icon: AlertCircle,     badgeKey: 'openContradictions' },
  { id: 'memory-fade',          title: 'Memory Fade Index',       path: '/discovery/memory-fade',           icon: Ghost,           badgeKey: 'fadingMemories' },
  { id: 'knowledge-records',    title: 'Knowledge Records',       path: '/discovery/knowledge-records',     icon: ScrollText },
];

export const DiscoveryNav = () => {
  const location = useLocation();
  const { summary } = useDiscoverySummary();

  const isActive = (path: string) =>
    path === '/discovery'
      ? location.pathname === '/discovery'
      : location.pathname.startsWith(path);

  const getBadgeCount = (key?: NavPanel['badgeKey']): number => {
    if (!key || !summary) return 0;
    return summary[key] ?? 0;
  };

  const renderGroup = (label: string, panels: NavPanel[]) => (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-white/30 uppercase tracking-widest px-3 pt-3 pb-1">
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
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium truncate">{panel.title}</span>
            {count > 0 && (
              <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border/60 bg-black/20 flex flex-col py-3 px-2 overflow-y-auto">
      {/* Overview link */}
      <Link
        to="/discovery"
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors mb-1 ${
          isActive('/discovery') && location.pathname === '/discovery'
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'text-white/70 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Compass className="h-4 w-4 shrink-0" />
        <span>Overview</span>
      </Link>

      {/* Lorebook shortcut */}
      <Link
        to="/lorebook"
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors mb-2"
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        <span>Generate Lorebook</span>
      </Link>

      <div className="border-t border-border/40 mt-1" />

      <div className="flex-1 space-y-2 mt-1">
        {renderGroup('Insights', INSIGHTS_PANELS)}
        <div className="border-t border-border/30 mx-1" />
        {renderGroup('Data & Control', DATA_CONTROL_PANELS)}
      </div>
    </aside>
  );
};

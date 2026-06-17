import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const PANEL_NAMES: Record<string, string> = {
  'soul-profile':           'Soul Profile',
  'identity':               'Identity Pulse',
  'relationships':          'Relationships',
  'insights-predictions':   'Insights & Predictions',
  'values-habits':          'Values & Habits',
  'decisions':              'Decision Memory',
  'life-arc':               'Recent Moments',
  'shadow':                 'Shadow',
  'xp':                     'Skills & Progress',
  'reactions-resilience':   'Reactions & Resilience',
  'memory-management':      'Memory Management',
  'memory-review':          'Memory Review Queue',
  'continuity':             'Continuity Intelligence',
  'correction-dashboard':   'Corrections & Pruning',
  'memory-fade':            'Memory Fade Index',
  'activity':               'Activity Calendar',
  'life-stats':             'Life Stats',
  'characters':             'Character Analytics',
  'memory-fabric':          'Memory Fabric',
  'truth-seeker':           'Truth Seeker',
  'saga':                   'Sagas',
  'map':                    'Life Map',
  'predictions':            'Predictions',
  'search':                 'Search Analytics',
  'achievements':           'Achievements',
  'knowledge-records':      'Knowledge Records',
};

export const PanelBreadcrumb = () => {
  const { pathname } = useLocation();
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  const panelName = PANEL_NAMES[segment];

  if (!panelName) return null;

  return (
    <nav className="flex items-center gap-1.5 mb-5 text-sm">
      <Link
        to="/discovery"
        className="flex items-center gap-0.5 text-white/40 hover:text-white/70 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Discovery
      </Link>
      <span className="text-white/20">/</span>
      <span className="text-white/60 font-medium">{panelName}</span>
    </nav>
  );
};

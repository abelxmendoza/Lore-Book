import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PANEL_TITLE_BY_SEGMENT } from './discoveryPanelRegistry';

export const PanelBreadcrumb = () => {
  const { pathname } = useLocation();
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  const panelName = PANEL_TITLE_BY_SEGMENT[segment];

  if (!panelName) return null;

  return (
    <nav className="hidden lg:flex items-center gap-1.5 mb-5 text-sm">
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

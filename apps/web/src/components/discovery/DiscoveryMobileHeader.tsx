import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, Compass, Menu } from 'lucide-react';
import { PANEL_TITLE_BY_SEGMENT } from './discoveryPanelRegistry';

type DiscoveryMobileHeaderProps = {
  onOpenAppSidebar?: () => void;
};

export function DiscoveryMobileHeader({ onOpenAppSidebar }: DiscoveryMobileHeaderProps) {
  const { pathname } = useLocation();
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  const panelName = segment && segment !== 'discovery' ? PANEL_TITLE_BY_SEGMENT[segment] : null;
  const isOverview = !panelName;

  return (
    <header
      className="lg:hidden shrink-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-xl"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
        paddingBottom: '8px',
      }}
    >
      <div className="flex items-center gap-2 px-2">
        {isOverview ? (
          onOpenAppSidebar && (
            <button
              type="button"
              onClick={onOpenAppSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] active:bg-white/10 touch-manipulation"
              aria-label="Open app menu"
            >
              <Menu className="h-5 w-5 text-white/55" />
            </button>
          )
        ) : (
          <Link
            to="/discovery"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 active:bg-white/10 touch-manipulation"
            aria-label="Back to Discovery overview"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}

        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-violet-600/20 border border-primary/25">
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-primary/70 font-semibold leading-none">
              Discovery Hub
            </p>
            <h1 className="text-sm font-bold text-white truncate leading-snug mt-0.5">
              {panelName ?? 'Overview'}
            </h1>
          </div>
        </div>

        {!isOverview && onOpenAppSidebar && (
          <button
            type="button"
            onClick={onOpenAppSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] active:bg-white/10 touch-manipulation"
            aria-label="Open app menu"
          >
            <Menu className="h-5 w-5 text-white/55" />
          </button>
        )}
      </div>
    </header>
  );
}

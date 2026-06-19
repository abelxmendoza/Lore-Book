import type { ElementType } from 'react';

export type OmniTimelineView = 'swimlanes' | 'events' | 'story' | 'calendar';

type NavItem = {
  id: OmniTimelineView;
  label: string;
  Icon: ElementType;
};

type OmniTimelineBottomNavProps = {
  view: OmniTimelineView;
  onViewChange: (view: OmniTimelineView) => void;
  items: NavItem[];
};

export const OmniTimelineBottomNav = ({
  view,
  onViewChange,
  items,
}: OmniTimelineBottomNavProps) => (
  <nav
    className="flex-shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md sm:hidden"
    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    aria-label="Timeline views"
  >
    <div className="flex items-stretch">
      {items.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 min-h-[52px] transition-colors touch-manipulation ${
              active ? 'text-primary' : 'text-white/40 active:text-white/70'
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.45)]' : ''}`} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

import type { ElementType } from 'react';
import './OmniTimelineBottomNav.css';

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
    className="omni-timeline-bottom-nav sm:hidden"
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
            className={`omni-timeline-bottom-nav__tab ${
              active ? 'omni-timeline-bottom-nav__tab--active' : 'omni-timeline-bottom-nav__tab--inactive'
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

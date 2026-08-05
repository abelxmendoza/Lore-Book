import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type EntityModalNavTab<T extends string = string> = {
  key: T;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Destructive tabs (Delete) render in red so they stay findable in the grid. */
  tone?: 'default' | 'danger';
};

type DangerAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active: boolean;
};

type Props<T extends string> = {
  tabs: EntityModalNavTab<T>[];
  activeTab: T | null;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  /** A compact destructive chip (delete/archive) at the end of the tab row. */
  dangerAction?: DangerAction;
  /**
   * Breakpoint at which this bar hides in favor of the modal's own desktop
   * nav. Must match that desktop nav's own `hidden <bp>:...` split exactly,
   * or there's a dead zone where neither nav renders. Default 'sm' (640px).
   */
  breakpoint?: 'sm' | 'md';
};

/**
 * Mobile-only bottom tab bar shared by every entity detail modal (Character,
 * Organization, Location, Skill, Project, Dating & Romance). Desktop keeps
 * each modal's own top nav; this is purely the mobile layout.
 *
 * Always a single horizontally scrollable row — multi-row grids underflow
 * into the home indicator / past the modal bottom once tab counts grow.
 * Destructive actions sit as a compact chip at the end of that row (not a
 * second full-width strip).
 *
 * Mount as a full-bleed sibling under the padded scroll body (not inside
 * horizontal padding) so the bar covers the modal bottom edge-to-edge.
 */
export function EntityModalBottomNav<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  dangerAction,
  breakpoint = 'sm',
}: Props<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeTab || !scrollerRef.current) return;
    const key = String(activeTab);
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(key)
        : key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const el = scrollerRef.current.querySelector(`[data-tab-key="${escaped}"]`);
    // jsdom (and some embeds) expose Element without scrollIntoView — optional
    // chaining only guards a null node, not a missing method.
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (el instanceof HTMLElement) {
      const scroller = scrollerRef.current;
      const left = el.offsetLeft - scroller.clientWidth / 2 + el.clientWidth / 2;
      if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      } else {
        scroller.scrollLeft = Math.max(0, left);
      }
    }
  }, [activeTab]);

  return (
    <nav
      className={cn(
        'w-full flex-shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-20',
        breakpoint === 'md' ? 'md:hidden' : 'sm:hidden'
      )}
      style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
      aria-label={ariaLabel}
    >
      <div
        ref={scrollerRef}
        className="flex w-full items-stretch gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-none px-1.5 pt-1 pb-0.5 [-webkit-overflow-scrolling:touch]"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          const danger = tab.tone === 'danger';
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              data-tab-key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'relative flex shrink-0 flex-col items-center justify-center gap-0.5 px-2.5 py-1 min-w-[3.25rem] min-h-[44px] touch-manipulation transition-colors',
                danger
                  ? active
                    ? 'text-red-200'
                    : 'text-red-300/70'
                  : active
                    ? 'text-primary'
                    : 'text-white/45'
              )}
              aria-current={active ? 'page' : undefined}
              aria-selected={active}
              aria-label={tab.label}
            >
              {active && (
                <span
                  className={cn(
                    'absolute top-0 h-0.5 w-5 rounded-full',
                    danger
                      ? 'bg-gradient-to-r from-red-500/60 via-red-400 to-red-500/60'
                      : 'bg-gradient-to-r from-primary/60 via-primary to-primary/60'
                  )}
                />
              )}
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[9px] font-medium leading-none whitespace-nowrap">{tab.shortLabel}</span>
            </button>
          );
        })}
        {dangerAction && (
          <button
            type="button"
            onClick={dangerAction.onClick}
            className={cn(
              'ml-0.5 flex shrink-0 flex-col items-center justify-center gap-0.5 self-center rounded-md border px-2 py-1 min-h-[36px] touch-manipulation transition-colors',
              dangerAction.active
                ? 'border-red-400/45 bg-red-500/20 text-red-50'
                : 'border-red-500/25 bg-transparent text-red-300/75 hover:bg-red-500/10 hover:text-red-100'
            )}
            aria-label={dangerAction.label}
          >
            <dangerAction.icon className="h-3 w-3 shrink-0" />
            <span className="text-[9px] font-medium leading-none whitespace-nowrap">{dangerAction.label}</span>
          </button>
        )}
      </div>
    </nav>
  );
}

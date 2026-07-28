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
  /** A destructive action (delete/archive) pinned below the grid, styled red — never crowds the main grid. */
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
 * Organization, Location, Skill, Project). Desktop keeps each modal's own top
 * nav; this is purely the mobile layout.
 *
 * Always a single horizontally scrollable row — multi-row grids underflow
 * into the home indicator / past the modal bottom once tab counts grow.
 * Destructive actions stay on a pinned strip under the row.
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
    const el = scrollerRef.current.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(String(activeTab))}"]`);
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <nav
      className={cn(
        'flex-shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-20',
        breakpoint === 'md' ? 'md:hidden' : 'sm:hidden'
      )}
      style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
      aria-label={ariaLabel}
    >
      <div
        ref={scrollerRef}
        className="flex items-stretch gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-none px-1.5 pt-1 pb-0.5 [-webkit-overflow-scrolling:touch]"
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
      </div>
      {dangerAction && (
        <div className="mx-2 mt-0.5 mb-0.5">
          <button
            type="button"
            onClick={dangerAction.onClick}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold touch-manipulation transition-colors',
              dangerAction.active
                ? 'border-red-400/50 bg-red-500/25 text-red-50'
                : 'border-red-500/35 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-50'
            )}
            aria-label={dangerAction.label}
          >
            <dangerAction.icon className="h-3.5 w-3.5 shrink-0" />
            {dangerAction.label}
          </button>
        </div>
      )}
    </nav>
  );
}

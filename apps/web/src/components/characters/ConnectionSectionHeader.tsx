import type { LucideIcon } from 'lucide-react';

/**
 * Consistent section header for the Connections tab (and anywhere else that
 * wants the same treatment): an icon chip that reads clearly against the
 * label, a right-aligned meta/action slot, and a hairline rule below to
 * separate the header from its section body. Every Connections section uses
 * this instead of hand-rolled <h3> variants so headers pop uniformly.
 */
export function ConnectionSectionHeader({
  icon: Icon,
  title,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pb-3 mb-4 border-b border-white/[0.07]">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="flex-1 min-w-0 truncate text-base font-semibold tracking-tight text-white">
        {title}
      </h3>
      {meta && (
        <span className="flex-shrink-0 text-[11px] font-medium tabular-nums text-white/40">
          {meta}
        </span>
      )}
      {action}
    </div>
  );
}

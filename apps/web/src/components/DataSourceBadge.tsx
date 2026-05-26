import type { RuntimeDataMode } from '../contexts/MockDataContext';

type BadgeVariant = 'LIVE' | 'DEMO' | 'OFFLINE' | 'LOCAL';

const BADGE_CONFIG: Record<BadgeVariant, { label: string; className: string }> = {
  LIVE:    { label: 'LIVE',    className: 'text-green-400/80 border-green-500/30 bg-green-500/10' },
  DEMO:    { label: 'DEMO',    className: 'text-amber-400/80 border-amber-500/30 bg-amber-500/10' },
  OFFLINE: { label: 'OFFLINE', className: 'text-orange-400/80 border-orange-500/30 bg-orange-500/10' },
  LOCAL:   { label: 'LOCAL',   className: 'text-yellow-400/70 border-yellow-500/30 bg-yellow-500/10' },
};

function modeToVariant(mode: RuntimeDataMode): BadgeVariant {
  if (mode === 'DEMO') return 'DEMO';
  if (mode === 'DEGRADED') return 'OFFLINE';
  return 'LIVE';
}

interface Props {
  /** Explicit variant override. If omitted, derived from runtimeDataMode prop. */
  variant?: BadgeVariant;
  /** RuntimeDataMode from context — used when variant is not explicitly provided. */
  mode?: RuntimeDataMode;
  className?: string;
}

/**
 * Inline data-source indicator chip.
 * Shows LIVE / DEMO / OFFLINE / LOCAL status for a data surface.
 * Use next to section headings, card titles, or panel headers that display
 * data whose origin the user should be able to trust-audit at a glance.
 */
export function DataSourceBadge({ variant, mode, className = '' }: Props) {
  const resolved: BadgeVariant = variant ?? (mode ? modeToVariant(mode) : 'LIVE');
  const config = BADGE_CONFIG[resolved];

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border tracking-wider select-none ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}

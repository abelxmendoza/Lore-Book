import { AlertTriangle, CheckCircle2, Clock3, History, ShieldQuestion, XCircle } from 'lucide-react';

import { Badge } from '../ui/badge';

type DisplayStatus =
  | 'proposed'
  | 'active'
  | 'challenged'
  | 'superseded'
  | 'retracted'
  | 'rejected';

const LEGACY_STATUS: Record<string, DisplayStatus> = {
  unverified: 'proposed',
  confirmed: 'active',
  disproven: 'rejected',
  PENDING: 'proposed',
  ACTIVE: 'active',
  DORMANT: 'challenged',
  HISTORICAL: 'superseded',
  SUPERSEDED: 'superseded',
};

const PRESENTATION: Record<DisplayStatus, {
  label: string;
  className: string;
  icon: typeof Clock3;
}> = {
  proposed: {
    label: 'Needs review',
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    icon: Clock3,
  },
  active: {
    label: 'Supported',
    className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    icon: CheckCircle2,
  },
  challenged: {
    label: 'Challenged',
    className: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
    icon: AlertTriangle,
  },
  superseded: {
    label: 'Historical',
    className: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
    icon: History,
  },
  retracted: {
    label: 'Retracted',
    className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400 line-through',
    icon: XCircle,
  },
  rejected: {
    label: 'Rejected',
    className: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    icon: ShieldQuestion,
  },
};

export function normalizeEpistemicStatus(status: string): DisplayStatus {
  if (status in PRESENTATION) return status as DisplayStatus;
  return LEGACY_STATUS[status] ?? 'proposed';
}

export function EpistemicStatusBadge({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const displayStatus = normalizeEpistemicStatus(status);
  const presentation = PRESENTATION[displayStatus];
  const Icon = presentation.icon;

  return (
    <Badge
      variant="outline"
      className={`${
        compact
          ? 'inline-flex max-w-full items-center gap-0.5 px-1 py-0 text-[9px] normal-case tracking-normal sm:gap-1 sm:px-1.5 sm:text-[10px]'
          : 'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] normal-case tracking-normal'
      } ${presentation.className}`}
    >
      <Icon className={compact ? 'h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3' : 'h-3 w-3 shrink-0'} aria-hidden="true" />
      {presentation.label}
    </Badge>
  );
}

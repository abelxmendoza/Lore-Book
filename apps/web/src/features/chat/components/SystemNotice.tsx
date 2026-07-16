/**
 * Compact system notice — never styled like a LoreBook assistant reply.
 */

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../../lib/cn';

export type SystemNoticeSeverity = 'info' | 'warning' | 'error';

export type SystemNoticeAction = {
  label: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
  loading?: boolean;
};

type SystemNoticeProps = {
  severity: SystemNoticeSeverity;
  title: string;
  message?: string;
  actions?: SystemNoticeAction[];
  onDismiss?: () => void;
  className?: string;
  children?: ReactNode;
  testId?: string;
};

const SEVERITY = {
  info: {
    Icon: Info,
    border: 'border-white/15',
    icon: 'text-sky-300/80',
    title: 'text-white/80',
  },
  warning: {
    Icon: AlertTriangle,
    border: 'border-amber-500/35',
    icon: 'text-amber-300/90',
    title: 'text-amber-100/90',
  },
  error: {
    Icon: AlertCircle,
    border: 'border-red-500/35',
    icon: 'text-red-300/90',
    title: 'text-red-100/90',
  },
} as const;

export function SystemNotice({
  severity,
  title,
  message,
  actions,
  onDismiss,
  className,
  children,
  testId = 'system-notice',
}: SystemNoticeProps) {
  const cfg = SEVERITY[severity];
  const Icon = cfg.Icon;

  return (
    <div
      role="status"
      data-testid={testId}
      data-severity={severity}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border bg-white/[0.03] px-3 py-2',
        cfg.border,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cfg.icon)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-xs font-medium leading-snug', cfg.title)}>{title}</p>
        {message ? <p className="text-[11px] leading-relaxed text-white/50">{message}</p> : null}
        {children}
        {actions && actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                data-testid={action.testId}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
                aria-busy={action.loading || undefined}
                className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/75 transition-colors hover:bg-white/15 hover:text-white touch-manipulation disabled:cursor-not-allowed disabled:opacity-45"
              >
                {action.loading ? `${action.label}…` : action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white/70 touch-manipulation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

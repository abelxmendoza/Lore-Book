import { Check, Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type CompactEntityChipProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  /** When set, renders a button; otherwise a span */
  onClick?: () => void;
  disabled?: boolean;
  'data-testid'?: string;
  'data-entity-status'?: string;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'>;

const BASE =
  'inline-flex items-center gap-0.5 rounded-full border px-1 py-px text-[9px] sm:text-[10px] font-medium leading-tight max-w-[88px] sm:max-w-[104px] shrink-0';

/**
 * Tiny entity pill for composer / focus strips above the chatbox.
 */
export function CompactEntityChip({
  children,
  className = '',
  title,
  onClick,
  disabled,
  'data-testid': testId,
  'data-entity-status': entityStatus,
  type = 'button',
  'aria-label': ariaLabel,
}: CompactEntityChipProps) {
  const classes = `${BASE} ${className}`;

  if (onClick) {
    return (
      <button
        type={type}
        data-testid={testId}
        data-entity-status={entityStatus}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={`${classes} touch-manipulation transition-colors disabled:opacity-60`}
      >
        {children}
      </button>
    );
  }

  return (
    <span data-testid={testId} data-entity-status={entityStatus} title={title} className={classes}>
      {children}
    </span>
  );
}

type SplitEntityChipProps = {
  label: ReactNode;
  className?: string;
  title?: string;
  onOpen?: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  'data-testid'?: string;
  openAriaLabel?: string;
  confirmAriaLabel?: string;
};

/**
 * Two-segment pill: tap label for details, tap ✓ to confirm without opening the menu.
 */
export function SplitEntityChip({
  label,
  className = '',
  title,
  onOpen,
  onConfirm,
  confirming = false,
  disabled = false,
  icon,
  'data-testid': testId,
  openAriaLabel,
  confirmAriaLabel,
}: SplitEntityChipProps) {
  const shell = `inline-flex shrink-0 items-stretch overflow-hidden rounded-full border ${className}`;

  return (
    <span data-testid={testId} className={shell} title={title}>
      {onOpen ? (
        <button
          type="button"
          data-testid={testId ? `${testId}-open` : undefined}
          className="inline-flex max-w-[76px] sm:max-w-[92px] items-center gap-0.5 px-1 py-px text-[9px] sm:text-[10px] font-medium leading-tight touch-manipulation transition-colors hover:bg-white/5"
          onClick={onOpen}
          aria-label={openAriaLabel}
        >
          {icon}
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <span className="inline-flex max-w-[76px] sm:max-w-[92px] items-center gap-0.5 px-1 py-px text-[9px] sm:text-[10px] font-medium leading-tight">
          {icon}
          <span className="truncate">{label}</span>
        </span>
      )}
      <button
        type="button"
        data-testid={testId ? `${testId}-confirm` : undefined}
        className="inline-flex items-center border-l border-white/10 px-1 py-px text-emerald-300/90 hover:bg-emerald-500/15 touch-manipulation transition-colors disabled:opacity-60"
        onClick={onConfirm}
        disabled={disabled || confirming}
        aria-label={confirmAriaLabel}
      >
        {confirming ? (
          <Loader2 className="h-2 w-2 animate-spin opacity-80" />
        ) : (
          <Check className="h-2 w-2" />
        )}
      </button>
    </span>
  );
}

export function CompactChipStrip({
  label,
  children,
  className = '',
  'data-testid': testId,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-1 overflow-x-auto scrollbar-none ${className}`}
    >
      {label && (
        <span className="text-[8px] uppercase tracking-wider text-white/25 shrink-0 select-none pr-0.5">
          {label}
        </span>
      )}
      <div className="flex items-center gap-0.5 min-w-0">{children}</div>
    </div>
  );
}

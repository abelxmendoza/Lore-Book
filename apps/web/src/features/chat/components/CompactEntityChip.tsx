import type { ButtonHTMLAttributes, ReactNode } from 'react';

type CompactEntityChipProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  /** When set, renders a button; otherwise a span */
  onClick?: () => void;
  disabled?: boolean;
  'data-testid'?: string;
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
  type = 'button',
  'aria-label': ariaLabel,
}: CompactEntityChipProps) {
  const classes = `${BASE} ${className}`;

  if (onClick) {
    return (
      <button
        type={type}
        data-testid={testId}
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
    <span data-testid={testId} title={title} className={classes}>
      {children}
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

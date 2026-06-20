import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';

type RescanChatsButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  rescanning?: boolean;
  title?: string;
  label?: string;
  compact?: boolean;
  className?: string;
};

export function RescanChatsButton({
  onClick,
  disabled = false,
  rescanning = false,
  title = 'Rescan my chats for suggestions',
  label,
  compact = false,
  className,
}: RescanChatsButtonProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || rescanning}
        className={cn(
          'h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40',
          className
        )}
        title={title}
        aria-label={title}
      >
        <RefreshCw className={cn('h-4 w-4', rescanning && 'animate-spin')} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || rescanning}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40',
        className
      )}
      title={title}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', rescanning && 'animate-spin')} />
      {label ?? (rescanning ? 'Rescanning…' : 'Rescan conversations')}
    </button>
  );
}

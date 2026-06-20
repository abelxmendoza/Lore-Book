import type { ReactNode } from 'react';
import { RefreshCw, X } from 'lucide-react';

type Props = {
  message: ReactNode;
  onDismiss: () => void;
  onRescan?: () => void;
  rescanning?: boolean;
  rescanLabel?: string;
  dismissLabel?: string;
  className?: string;
};

export function SuggestionPanelEmptyState({
  message,
  onDismiss,
  onRescan,
  rescanning = false,
  rescanLabel = 'Rescan conversations',
  dismissLabel = 'Close until next detection',
  className = '',
}: Props) {
  return (
    <div className={`rounded-lg border border-white/10 bg-black/25 px-2.5 sm:px-3 py-2.5 sm:py-3 space-y-2.5 ${className}`}>
      <p className="text-[11px] sm:text-xs text-white/45 leading-relaxed">{message}</p>
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {onRescan && (
          <button
            type="button"
            onClick={onRescan}
            disabled={rescanning}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-50 touch-manipulation"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            {rescanning ? 'Scanning…' : rescanLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 rounded-md border border-white/10 bg-transparent px-3 py-2 text-[11px] font-medium text-white/50 hover:text-white/75 hover:bg-white/[0.04] touch-manipulation"
        >
          <X className="h-3.5 w-3.5" />
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}

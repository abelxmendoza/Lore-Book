import { useEffect, useRef, useState } from 'react';
import { Check, Copy, LayoutGrid, LayoutList } from 'lucide-react';
import { copyTextToClipboard } from '../../lib/listClipboard';

export type CardViewMode = 'grid' | 'list';

type Props = {
  viewMode: CardViewMode;
  onViewModeChange: (mode: CardViewMode) => void;
  /** Plain-text payload for "Copy all" (list + metadata). */
  copyText: string;
  copyDisabled?: boolean;
  copyLabel?: string;
  className?: string;
  storageKey?: string;
};

export function GridListViewToolbar({
  viewMode,
  onViewModeChange,
  copyText,
  copyDisabled,
  copyLabel = 'Copy all',
  className = '',
  storageKey,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setMode = (mode: CardViewMode) => {
    onViewModeChange(mode);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        /* ignore */
      }
    }
  };

  const copyAll = async () => {
    const ok = await copyTextToClipboard(copyText);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`}>
      <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
        <button
          type="button"
          onClick={() => setMode('grid')}
          className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
            viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'
          }`}
          title="Grid view"
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMode('list')}
          className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
            viewMode === 'list' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'
          }`}
          title="List view"
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => void copyAll()}
        disabled={copyDisabled || !copyText.trim()}
        title="Copy the whole list and its metadata as plain text"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${
          copied
            ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
            : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : copyLabel}
      </button>
    </div>
  );
}

export function readStoredCardViewMode(
  storageKey: string,
  fallback: CardViewMode = 'grid',
): CardViewMode {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === 'grid' || v === 'list') return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

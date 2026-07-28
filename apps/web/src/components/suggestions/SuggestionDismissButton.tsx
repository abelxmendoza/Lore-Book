import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { DismissSuggestionReason } from '../../api/suggestionDismiss';

const REASONS: Array<{ value: DismissSuggestionReason; label: string; hint: string }> = [
  { value: 'not_entity', label: 'Not this kind of thing', hint: 'Stop suggesting it in this book' },
  { value: 'wrong_book', label: 'Wrong book', hint: 'Better as another entity type' },
  { value: 'duplicate', label: 'Duplicate / already tracked', hint: 'I have this already' },
  { value: 'noise', label: 'Just noise', hint: 'Sentence fragment or bad extraction' },
];

type Props = {
  disabled?: boolean;
  onDismiss: (reason?: DismissSuggestionReason) => void | Promise<void>;
  buttonLabel?: string;
  className?: string;
  align?: 'left' | 'right';
};

/** Single dismiss control — one X that opens reason options (plus plain dismiss). */
export function SuggestionDismissButton({
  disabled,
  onDismiss,
  buttonLabel = 'Dismiss',
  className = '',
  align = 'right',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 disabled:opacity-50"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-20 mt-1 w-52 rounded-md border border-white/15 bg-zinc-900/95 p-1 shadow-xl ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <p className="px-2 py-1 text-[9px] text-white/45">Dismiss this suggestion</p>
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              void onDismiss();
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-white/[0.08] disabled:opacity-50"
          >
            <span className="block text-xs text-white/85">{buttonLabel}</span>
            <span className="block text-[10px] text-white/40">Hide without teaching a reason</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <p className="px-2 py-1 text-[9px] text-white/45">Or teach LoreBook why</p>
          {REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                void onDismiss(reason.value);
              }}
              className="w-full rounded px-2 py-1.5 text-left hover:bg-white/[0.08] disabled:opacity-50"
            >
              <span className="block text-xs text-white/85">{reason.label}</span>
              <span className="block text-[10px] text-white/40">{reason.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

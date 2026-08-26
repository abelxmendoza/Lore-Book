import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { copyTextToClipboard } from '../../lib/listClipboard';

type Props = {
  text: string;
  disabled?: boolean;
  'data-testid'?: string;
};

export function ConnectionsCopyAllButton({
  text,
  disabled = false,
  'data-testid': testId = 'character-modal-connections-copy-all',
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled}
      title="Copy all connections as plain text"
      aria-label="Copy all connections"
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition disabled:pointer-events-none disabled:opacity-40 ${
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white'
      }`}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy all connections'}
    </button>
  );
}

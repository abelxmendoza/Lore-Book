import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { buildFamilyTreeClipboardText } from '../../lib/familyTreeClipboard';
import { copyTextToClipboard } from '../../lib/listClipboard';
import type { FamilyTree } from '../../types/socialRoles';

type Props = {
  tree: FamilyTree | null | undefined;
  title?: string;
  filters?: string[];
  /** Compact icon+label for dense toolbars. */
  size?: 'sm' | 'md';
  className?: string;
  'data-testid'?: string;
};

export function FamilyTreeCopyAllButton({
  tree,
  title,
  filters,
  size = 'sm',
  className = '',
  'data-testid': testId = 'family-tree-copy-all',
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memberCount = tree?.members?.length ?? 0;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const text = buildFamilyTreeClipboardText(tree, { title, filters });
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const pad = size === 'sm' ? 'px-2 py-1 text-[10px] gap-1' : 'px-2.5 py-1.5 text-xs gap-1.5';
  const iconCls = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={memberCount === 0}
      title="Copy all family tree members, relationships, parents, and children"
      aria-label="Copy all family tree"
      data-testid={testId}
      className={`inline-flex items-center rounded-lg border font-medium transition disabled:opacity-40 disabled:pointer-events-none ${pad} ${
        copied
          ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
          : 'border-white/10 text-white/55 hover:text-white hover:border-white/25'
      } ${className}`}
    >
      {copied ? <Check className={iconCls} /> : <Copy className={iconCls} />}
      {copied ? 'Copied' : 'Copy all'}
    </button>
  );
}

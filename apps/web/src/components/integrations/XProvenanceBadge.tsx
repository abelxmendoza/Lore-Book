import { Twitter } from 'lucide-react';

export type XSource = {
  sourceId?: string;
  url?: string;
  postedAt?: string;
  excerpt?: string;
};

export const XProvenanceBadge = ({ source, compact = false }: { source: XSource; compact?: boolean }) => {
  if (!source.url && !source.sourceId) return null;

  const displayUrl = source.url || (source.sourceId ? `https://x.com/i/web/status/${source.sourceId}` : '#');
  const date = source.postedAt ? new Date(source.postedAt).toLocaleDateString() : '';

  return (
    <a
      href={displayUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/20 hover:text-sky-200 transition"
      title={source.excerpt ? `From X: ${source.excerpt}` : 'View original X post'}
    >
      <Twitter className="h-3 w-3" />
      {compact ? 'X' : 'X post'}
      {date && <span className="text-[10px] opacity-60">• {date}</span>}
    </a>
  );
};

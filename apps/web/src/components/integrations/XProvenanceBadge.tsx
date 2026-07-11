import { Twitter } from 'lucide-react';
import { safeXPostUrl, xStatusUrlFromId } from '../../lib/safeUrl';

export type XSource = {
  sourceId?: string;
  url?: string;
  postedAt?: string;
  excerpt?: string;
};

export const XProvenanceBadge = ({ source, compact = false }: { source: XSource; compact?: boolean }) => {
  if (!source.url && !source.sourceId) return null;

  // Only allow validated http(s) X/Twitter URLs — blocks javascript: / data: XSS
  // and unvalidated open redirects (CodeQL js/xss, js/client-side-unvalidated-url-redirection).
  const displayUrl =
    safeXPostUrl(source.url) || xStatusUrlFromId(source.sourceId) || null;
  if (!displayUrl) return null;

  const date = source.postedAt ? new Date(source.postedAt).toLocaleDateString() : '';
  const safeTitle = source.excerpt
    ? `From X: ${source.excerpt.replace(/[\u0000-\u001f<>]/g, '').slice(0, 200)}`
    : 'View original X post';

  return (
    <a
      href={displayUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/20 hover:text-sky-200 transition"
      title={safeTitle}
    >
      <Twitter className="h-3 w-3" />
      {compact ? 'X' : 'X post'}
      {date && <span className="text-[10px] opacity-60">• {date}</span>}
    </a>
  );
};

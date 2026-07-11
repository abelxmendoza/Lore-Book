import { Twitter } from 'lucide-react';
import { xStatusUrlFromId } from '../../lib/safeUrl';

export type XSource = {
  sourceId?: string;
  url?: string;
  postedAt?: string;
  excerpt?: string;
};

/**
 * Provenance badge linking to an X status.
 *
 * CodeQL (js/xss, js/client-side-unvalidated-url-redirection): never put a
 * user/DB-provided full URL into href. Only build from a validated snowflake id
 * with a constant https://x.com prefix.
 */
export const XProvenanceBadge = ({ source, compact = false }: { source: XSource; compact?: boolean }) => {
  // Constant-prefix construction only — ignores source.url entirely.
  const href = xStatusUrlFromId(source.sourceId);
  if (!href) return null;

  const date = source.postedAt ? new Date(source.postedAt).toLocaleDateString() : '';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/20 hover:text-sky-200 transition"
      title="View original X post"
    >
      <Twitter className="h-3 w-3" />
      {compact ? 'X' : 'X post'}
      {date && <span className="text-[10px] opacity-60">• {date}</span>}
    </a>
  );
};

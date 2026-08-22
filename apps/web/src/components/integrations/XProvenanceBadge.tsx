import { Twitter } from 'lucide-react';
import { xStatusHref } from '../../lib/safeUrl';

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
 * user/DB-provided full URL into href. Rebuild from a validated snowflake id
 * with a constant https://x.com prefix (sourceId, or id extracted from url).
 */
export const XProvenanceBadge = ({ source, compact = false }: { source: XSource; compact?: boolean }) => {
  const href = xStatusHref(source);
  if (!href) return null;

  const date = source.postedAt ? new Date(source.postedAt).toLocaleDateString() : '';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/35 bg-gradient-to-r from-sky-500/15 to-cyan-500/10 px-2 py-0.5 text-xs text-sky-200 hover:from-sky-500/25 hover:to-cyan-500/20 hover:text-white transition shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
      title={source.excerpt ? `“${source.excerpt}”` : 'View original post on X'}
    >
      <Twitter className="h-3 w-3" />
      {compact ? 'X' : 'From X'}
      {date && <span className="text-[10px] opacity-60">· {date}</span>}
    </a>
  );
};

import { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { suggestionReclassifyApi } from '../../api/suggestionReclassify';
import { apiCache } from '../../lib/cache';
import { cn } from '../../lib/cn';
import {
  REDIRECTABLE_SUGGESTION_DOMAINS,
  SUGGESTION_DOMAIN_LABELS,
  type AlternativeCategory,
  type SuggestionBookDomain,
} from '../../lib/suggestionMatchTypes';
import { useToast } from '../ui/toast';

type SuggestionCategoryRedirectProps = {
  name: string;
  fromDomain: SuggestionBookDomain;
  alternatives?: AlternativeCategory[];
  suggestionId?: string;
  context?: string;
  evidence?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  onReclassified?: (toDomain: SuggestionBookDomain) => void;
};

function reasonHint(reason: AlternativeCategory['reason']): string {
  switch (reason) {
    case 'known_in_book':
      return 'Already in that book';
    case 'lexical_type':
      return 'Reads like this type';
    case 'cross_book_guard':
      return 'Better fit there';
    default:
      return '';
  }
}

export function SuggestionCategoryRedirect({
  name,
  fromDomain,
  alternatives = [],
  suggestionId,
  context,
  evidence,
  description,
  disabled,
  className,
  onReclassified,
}: SuggestionCategoryRedirectProps) {
  const toast = useToast({ maxVisible: 2 });
  const [expanded, setExpanded] = useState(alternatives.length > 0);
  const [redirecting, setRedirecting] = useState<SuggestionBookDomain | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherDomains = REDIRECTABLE_SUGGESTION_DOMAINS.filter((d) => d !== fromDomain);
  const detectedDomains = new Set(alternatives.map((a) => a.domain));

  const handleRedirect = async (toDomain: SuggestionBookDomain) => {
    if (disabled || redirecting) return;
    setRedirecting(toDomain);
    setError(null);
    setNotice(null);
    try {
      const result = await suggestionReclassifyApi.reclassify({
        name,
        fromDomain,
        toDomain,
        suggestionId,
        context,
        evidence,
        description,
      });
      apiCache.deletePattern(/\/api\/(characters|locations|quests|skills|projects|conversation)/);
      setNotice(result.message);
      onReclassified?.(toDomain);

      if (result.autoMerged) {
        toast.info(result.mergeNotification ?? result.message, 0);
      } else if (result.redirectMatch?.disposition === 'uncertain') {
        toast.warning(result.message, 8000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reclassify suggestion');
    } finally {
      setRedirecting(null);
    }
  };

  return (
    <>
      <div className={cn('space-y-1', className)}>
        {alternatives.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] text-violet-200/70">Also looks like:</span>
            {alternatives.map((alt) => (
              <span
                key={alt.domain}
                title={reasonHint(alt.reason)}
                className="text-[9px] px-1.5 py-0.5 rounded border border-violet-500/25 bg-violet-500/10 text-violet-100/90"
              >
                {alt.label}
                {alt.reason === 'known_in_book' ? ' ✓' : ''}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-[9px] text-white/40 hover:text-violet-200/90 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-2.5 w-2.5" />
          Wrong category? Send elsewhere
          {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>

        {expanded && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {otherDomains.map((domain) => {
              const alt = alternatives.find((a) => a.domain === domain);
              const isDetected = detectedDomains.has(domain);
              const isBusy = redirecting === domain;
              return (
                <button
                  key={domain}
                  type="button"
                  disabled={disabled || Boolean(redirecting)}
                  title={
                    alt
                      ? reasonHint(alt.reason)
                      : `Train LoreBook: "${name}" belongs in ${SUGGESTION_DOMAIN_LABELS[domain]}`
                  }
                  onClick={() => void handleRedirect(domain)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] transition-colors disabled:opacity-50',
                    isDetected
                      ? 'border-violet-500/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
                      : 'border-white/10 bg-black/20 text-white/55 hover:border-white/20 hover:text-white/80'
                  )}
                >
                  {isBusy ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {SUGGESTION_DOMAIN_LABELS[domain]}
                </button>
              );
            })}
          </div>
        )}

        {notice && !redirecting && (
          <p className="text-[9px] text-emerald-200/90 leading-snug">{notice}</p>
        )}
        {error && (
          <p className="text-[9px] text-red-300/90 leading-snug">{error}</p>
        )}
      </div>
      <toast.ToastContainer />
    </>
  );
}

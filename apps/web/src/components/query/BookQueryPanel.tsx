import { BookOpen, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchJson } from '../../lib/api';
import type {
  BookQueryDomain,
  UniversalBookQueryResponse,
  UniversalBookQueryResult,
} from '../../lib/api-contracts';
import { cn } from '../../lib/cn';
import { compileDemoUniversalBookQuery } from '../../lib/universalBookQueryDemo';

const DOMAIN_LABELS: Record<BookQueryDomain, string> = {
  character: 'People',
  organization: 'Groups',
  family: 'Family',
  location: 'Places',
  romance: 'Romance',
  project: 'Projects',
  skill: 'Skills',
  quest: 'Quests',
  event: 'Life Log',
  document: 'Documents',
  narrative: 'Narrative',
};

const DOMAIN_ROUTES: Record<BookQueryDomain, string> = {
  character: '/characters',
  organization: '/organizations',
  family: '/family',
  location: '/locations',
  romance: '/love',
  project: '/projects',
  skill: '/skills',
  quest: '/quests',
  event: '/events',
  document: '/documents',
  narrative: '/narrative-anchors',
};

const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as BookQueryDomain[];

type Props = {
  demoMode?: boolean;
  domains?: BookQueryDomain[];
  title?: string;
  description?: string;
  placeholder?: string;
  inputAriaLabel?: string;
  submitLabel?: string;
  resultNoun?: string;
  compact?: boolean;
  showDomainFilters?: boolean;
  className?: string;
  onResponse?: (response: UniversalBookQueryResponse | null) => void;
  onSelectResult?: (result: UniversalBookQueryResult) => void;
  controller?: {
    query: string;
    onQueryChange: (value: string) => void;
    onSubmit: () => void | Promise<void>;
    onClear: () => void;
    loading: boolean;
    error?: string | null;
    total?: number;
    results?: Array<{
      id: string;
      title: string;
      status?: string | null;
      reason?: string;
    }>;
    warnings?: string[];
  };
};

export function BookQueryPanel({
  demoMode = false,
  domains,
  title = 'Ask LoreBook',
  description = 'Search across your people, places, relationships, projects, skills, quests, events, documents, and story.',
  placeholder = 'Try “What skills support my active quests?”',
  inputAriaLabel,
  submitLabel = 'Ask',
  resultNoun,
  compact = false,
  showDomainFilters = !domains?.length,
  className,
  onResponse,
  onSelectResult,
  controller,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<BookQueryDomain[]>(domains ?? []);
  const [response, setResponse] = useState<UniversalBookQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableDomains = domains?.length ? domains : ALL_DOMAINS;
  const controlledResponse: UniversalBookQueryResponse | null = (() => {
    if (!controller || controller.total === undefined) return null;
    const domain = domains?.[0] ?? 'character';
    const results: UniversalBookQueryResult[] = (controller.results ?? []).map((result) => ({
      id: result.id,
      domain,
      title: result.title,
      status: result.status,
      score: 1,
      matchedReasons: result.reason ? [result.reason] : ['Matches your query'],
      evidence: [],
      relatedEntities: [],
    }));
    return {
      query: controller.query,
      intent: 'find',
      results,
      connections: [],
      groups: results.length ? [{ domain, count: controller.total, results }] : [],
      total: controller.total,
      facets: { domains: results.length ? [{ value: domain, count: controller.total }] : [], statuses: [] },
      warnings: controller.warnings ?? [],
      diagnostics: { queriedDomains: [domain], degradedDomains: [], elapsedMs: 0 },
    };
  })();
  const activeQuery = controller?.query ?? query;
  const activeLoading = controller?.loading ?? loading;
  const activeError = controller?.error ?? error;
  const visibleResponse = controller ? controlledResponse : response;

  const selectedDomainSet = useMemo(() => new Set(selectedDomains), [selectedDomains]);

  const submit = async () => {
    const value = activeQuery.trim();
    if (!value || activeLoading) return;
    if (controller) {
      await controller.onSubmit();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const requestedDomains = selectedDomains.length ? selectedDomains : domains;
      const result = demoMode
        ? compileDemoUniversalBookQuery(value, requestedDomains)
        : (await fetchJson<{ success: true; result: UniversalBookQueryResponse }>('/api/entities/query', {
            method: 'POST',
            body: JSON.stringify({
              query: value,
              domains: requestedDomains,
              limit: compact ? 24 : 50,
              perDomainLimit: compact ? 6 : 12,
              includeEvidence: true,
            }),
          })).result;
      setResponse(result);
      onResponse?.(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'LoreBook could not run that query.';
      setError(message);
      setResponse(null);
      onResponse?.(null);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    if (controller) {
      controller.onClear();
      return;
    }
    setQuery('');
    setResponse(null);
    setError(null);
    onResponse?.(null);
  };

  const selectResult = (result: UniversalBookQueryResult) => {
    if (onSelectResult) {
      onSelectResult(result);
    }
  };

  const toggleDomain = (domain: BookQueryDomain) => {
    setSelectedDomains((current) =>
      current.includes(domain)
        ? current.filter((value) => value !== domain)
        : [...current, domain],
    );
  };

  return (
    <section
      className={cn(
        'rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/25 via-black/35 to-violet-950/20',
        compact ? 'p-3' : 'p-4 sm:p-5',
        className,
      )}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {!compact && <p className="mt-0.5 text-xs leading-relaxed text-white/45">{description}</p>}
          </div>
        </div>
        {visibleResponse && (
          <button
            type="button"
            onClick={clear}
            className="rounded-lg p-1.5 text-white/35 hover:bg-white/5 hover:text-white/70"
            aria-label="Clear LoreBook query"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDomainFilters && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {availableDomains.map((domain) => {
            const active = selectedDomainSet.has(domain);
            return (
              <button
                key={domain}
                type="button"
                onClick={() => toggleDomain(domain)}
                aria-pressed={active}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition',
                  active
                    ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                    : 'border-white/10 bg-black/20 text-white/45 hover:border-white/20 hover:text-white/70',
                )}
              >
                {DOMAIN_LABELS[domain]}
              </button>
            );
          })}
        </div>
      )}

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 focus-within:border-cyan-400/40">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            value={activeQuery}
            onChange={(event) => {
              if (controller) controller.onQueryChange(event.target.value);
              else setQuery(event.target.value);
            }}
            placeholder={placeholder}
            aria-label={inputAriaLabel ?? title}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-white outline-none placeholder:text-white/30 sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!activeQuery.trim() || activeLoading}
          className="min-h-[44px] rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {activeLoading ? 'Searching…' : submitLabel}
        </button>
      </form>

      {activeError && <p className="mt-2 text-xs text-red-300" role="alert">{activeError}</p>}

      {visibleResponse && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-white/55">
              {resultNoun ? (
                `${visibleResponse.total} matching ${resultNoun}${visibleResponse.total === 1 ? '' : 's'}`
              ) : (
                <>
                  <span className="font-semibold text-cyan-200">{visibleResponse.total}</span>{' '}
                  grounded record{visibleResponse.total === 1 ? '' : 's'} across{' '}
                  {visibleResponse.groups.length} book{visibleResponse.groups.length === 1 ? '' : 's'}
                </>
              )}
            </p>
            {visibleResponse.connections.length > 0 && (
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
                {visibleResponse.connections.length} connection{visibleResponse.connections.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {visibleResponse.warnings.map((warning) => (
            <p key={warning} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] text-amber-100/75">
              {warning}
            </p>
          ))}

          {visibleResponse.connections.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.04] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-200/60">
                Grounded connections
              </p>
              {visibleResponse.connections.slice(0, compact ? 4 : 8).map((connection, index) => (
                <p
                  key={`${connection.fromId}:${connection.toId}:${connection.relation}:${index}`}
                  className="text-[11px] leading-relaxed text-white/55"
                >
                  {connection.reason}
                </p>
              ))}
            </div>
          )}

          <div className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
            {visibleResponse.results.slice(0, compact ? 8 : 18).map((result) => {
              const content = (
                <>
                <BookOpen className="h-4 w-4 shrink-0 text-cyan-300/60" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/85">{result.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-white/40">
                    {DOMAIN_LABELS[result.domain]}
                    {result.status ? ` · ${result.status.replaceAll('_', ' ')}` : ''}
                  </span>
                  {result.matchedReasons[0] && (
                    <span className="mt-0.5 block truncate text-[10px] text-cyan-100/45">
                      {result.matchedReasons[0]}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20 group-hover:text-cyan-300/70" />
                </>
              );
              const className = 'group flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-left hover:border-cyan-400/25 hover:bg-cyan-500/[0.04]';
              return onSelectResult ? (
                <button
                  key={`${result.domain}:${result.id}`}
                  type="button"
                  onClick={() => selectResult(result)}
                  className={className}
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={`${result.domain}:${result.id}`}
                  to={`${DOMAIN_ROUTES[result.domain]}?q=${encodeURIComponent(result.title)}`}
                  className={className}
                >
                  {content}
                </Link>
              );
            })}
          </div>

          {visibleResponse.results.length === 0 && (
            <p className="py-2 text-center text-xs text-white/40">
              No grounded records matched this query.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

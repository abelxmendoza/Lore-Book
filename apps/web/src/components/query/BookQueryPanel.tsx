import { MessageCircle, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { BookQueryDomain } from '../../lib/api-contracts';
import { cn } from '../../lib/cn';
import {
  openBookQueryChat,
  resolveBookQueryChatPreset,
} from '../../lib/openBookQueryChat';

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

const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as BookQueryDomain[];

type Props = {
  domains?: BookQueryDomain[];
  title?: string;
  description?: string;
  placeholder?: string;
  inputAriaLabel?: string;
  compact?: boolean;
  showDomainFilters?: boolean;
  className?: string;
};

export function BookQueryPanel({
  domains,
  title = 'Ask in chat',
  description,
  placeholder,
  inputAriaLabel,
  compact = false,
  showDomainFilters = !domains?.length,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<BookQueryDomain[]>(domains ?? []);
  const availableDomains = domains?.length ? domains : ALL_DOMAINS;
  const selectedDomainSet = useMemo(() => new Set(selectedDomains), [selectedDomains]);
  const activeDomains = selectedDomains.length ? selectedDomains : domains;
  const { preset } = resolveBookQueryChatPreset(activeDomains);
  const resolvedDescription = description ?? preset.description;
  const resolvedPlaceholder = placeholder ?? preset.placeholder;

  const submit = () => {
    const value = query.trim();
    if (!value) return;
    openBookQueryChat(value, activeDomains);
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
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-2">
          <MessageCircle className="h-4 w-4 text-cyan-300" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {!compact && (
            <p className="mt-0.5 text-xs leading-relaxed text-white/45">{resolvedDescription}</p>
          )}
        </div>
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
          submit();
        }}
      >
        <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 focus-within:border-cyan-400/40">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={resolvedPlaceholder}
            aria-label={inputAriaLabel ?? title}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-white outline-none placeholder:text-white/30 sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!query.trim()}
          className="min-h-[44px] rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask in chat
        </button>
      </form>
    </section>
  );
}

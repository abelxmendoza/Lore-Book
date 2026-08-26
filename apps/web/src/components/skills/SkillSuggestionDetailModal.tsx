import { useMemo, useState } from 'react';
import { Briefcase, Heart, Link2, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';

import type { SkillSuggestion } from '../../api/skills';
import { formatSkillCertaintyDetail } from '../../lib/skillStory';
import { monetizationLabel, usageLabel } from '../../lib/skillProfile';
import { isSimilarSuggestion, suggestionMatchedId, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import type { SuggestionBookEntry } from '../../lib/suggestionMatchTypes';
import type { DismissSuggestionReason } from '../../api/suggestionDismiss';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { SuggestionDismissButton } from '../suggestions/SuggestionDismissButton';
import { SuggestionMergeHint } from '../suggestions/SuggestionMergeHint';

const CATEGORY_COLORS: Record<string, string> = {
  professional: 'border-blue-500/25 bg-blue-500/15 text-blue-100',
  creative: 'border-purple-500/25 bg-purple-500/15 text-purple-100',
  artistic: 'border-fuchsia-500/25 bg-fuchsia-500/15 text-fuchsia-100',
  technical: 'border-cyan-500/25 bg-cyan-500/15 text-cyan-100',
  physical: 'border-orange-500/25 bg-orange-500/15 text-orange-100',
  social: 'border-pink-500/25 bg-pink-500/15 text-pink-100',
  intellectual: 'border-indigo-500/25 bg-indigo-500/15 text-indigo-100',
  emotional: 'border-rose-500/25 bg-rose-500/15 text-rose-100',
  practical: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-100',
};

function evidenceQuote(s: SkillSuggestion): string | undefined {
  const raw = s.evidence?.[0];
  if (!raw) return undefined;
  return typeof raw === 'string' ? raw : raw.text;
}

type MergeTarget = { id: string; name: string };

type Props = {
  suggestion: SkillSuggestion;
  adding?: boolean;
  bookEntries?: SuggestionBookEntry[];
  onClose: () => void;
  onAdd: (suggestion: SkillSuggestion) => void;
  onMerge: (suggestion: SkillSuggestion, target: MergeTarget) => void;
  onDismiss: (suggestion: SkillSuggestion, reason?: DismissSuggestionReason) => void;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function SkillSuggestionDetailModal({
  suggestion,
  adding = false,
  bookEntries = [],
  onClose,
  onAdd,
  onMerge,
  onDismiss,
}: Props) {
  const quote = evidenceQuote(suggestion);
  const category = suggestion.skill_type ?? suggestion.skill_category ?? 'skill';
  const categoryClass = CATEGORY_COLORS[category] ?? 'border-white/15 bg-white/10 text-white/70';
  const [mergeQuery, setMergeQuery] = useState('');
  const suggestedMatchId = suggestionMatchedId(suggestion);
  const suggestedMatchName = suggestionMatchedName(suggestion);

  const mergeable = useMemo(
    () => bookEntries.filter((entry): entry is SuggestionBookEntry & { id: string } => Boolean(entry.id)),
    [bookEntries],
  );

  const suggestedTarget = useMemo(() => {
    if (suggestedMatchId) {
      return mergeable.find((entry) => entry.id === suggestedMatchId)
        ?? (suggestedMatchName ? { id: suggestedMatchId, name: suggestedMatchName } : null);
    }
    if (suggestedMatchName) {
      const needle = normalize(suggestedMatchName);
      return mergeable.find((entry) => normalize(entry.name) === needle) ?? null;
    }
    return null;
  }, [mergeable, suggestedMatchId, suggestedMatchName]);

  const searchHits = useMemo(() => {
    const q = normalize(mergeQuery);
    if (q.length < 1) return [];
    return mergeable
      .filter((entry) => {
        if (suggestedTarget && entry.id === suggestedTarget.id) return false;
        const haystack = [entry.name, ...(entry.aliases ?? [])].map(normalize);
        return haystack.some((part) => part.includes(q));
      })
      .slice(0, 8);
  }, [mergeQuery, mergeable, suggestedTarget]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onClose={onClose}
        className="sm:max-w-lg border-teal-500/30 bg-gradient-to-br from-teal-950/40 via-black to-black"
      >
        <DialogHeader>
          <div className="flex min-w-0 items-start gap-3 pr-2">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-teal-500/15 text-teal-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Skill suggestion
              </p>
              <DialogTitle className="mt-1 break-words text-xl leading-snug sm:text-2xl">
                {suggestion.skill_name}
              </DialogTitle>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close suggestion"
            className="h-9 w-9 min-h-9 min-w-9 shrink-0 text-white/70"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${categoryClass}`}>
              {category}
            </span>
            <SuggestionMergeHint item={suggestion} bookLabel="Skills book" />
            {suggestion.monetization && (
              <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/25 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200">
                <Briefcase className="h-2.5 w-2.5 shrink-0" />
                {monetizationLabel(suggestion.monetization)}
              </span>
            )}
            {typeof suggestion.confidence === 'number' && (
              <span className="text-[10px] text-white/45" title={formatSkillCertaintyDetail(suggestion.confidence)}>
                {formatSkillCertaintyDetail(suggestion.confidence)}
              </span>
            )}
          </div>

          {suggestion.description && (
            <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
              {suggestion.description}
            </p>
          )}

          {suggestion.origin_story && (
            <p className="text-sm leading-relaxed text-white/60">{suggestion.origin_story}</p>
          )}

          {quote && (
            <p className="text-sm italic leading-relaxed text-white/50">&ldquo;{quote}&rdquo;</p>
          )}

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {typeof suggestion.proficiency === 'number' && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Proficiency</dt>
                <dd className="text-white/85">{suggestion.proficiency}%</dd>
              </div>
            )}
            {typeof suggestion.enjoyment === 'number' && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Enjoyment</dt>
                <dd className="inline-flex items-center gap-1 text-white/85">
                  <Heart className="h-3 w-3 text-pink-300/80" />
                  {suggestion.enjoyment}%
                </dd>
              </div>
            )}
            {suggestion.usage_frequency && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Usage</dt>
                <dd className="text-white/85">{usageLabel(suggestion.usage_frequency)}</dd>
              </div>
            )}
            {suggestion.trajectory && suggestion.trajectory !== 'unknown' && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Trajectory</dt>
                <dd className="capitalize text-white/85">{suggestion.trajectory}</dd>
              </div>
            )}
            {suggestion.parent_skill_name && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Parent skill</dt>
                <dd className="text-white/85">{suggestion.parent_skill_name}</dd>
              </div>
            )}
            {suggestion.related_projects && suggestion.related_projects.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Related projects</dt>
                <dd className="text-white/85">{suggestion.related_projects.join(', ')}</dd>
              </div>
            )}
            {suggestion.related_jobs && suggestion.related_jobs.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Related jobs</dt>
                <dd className="text-white/85">{suggestion.related_jobs.join(', ')}</dd>
              </div>
            )}
            {suggestion.matched_book_name && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Matched book entry</dt>
                <dd className="text-white/85">{suggestion.matched_book_name}</dd>
              </div>
            )}
          </dl>

          <SuggestionCategoryRedirect
            name={suggestion.skill_name}
            fromDomain="skills"
            suggestionId={suggestion.id}
            alternatives={suggestion.alternative_categories}
            description={suggestion.description}
            evidence={quote}
            disabled={adding}
            onReclassified={() => onDismiss(suggestion, 'wrong_book')}
          />

          {mergeable.length > 0 && (
            <section className="space-y-2.5 rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Merge with a skill already in your book
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                  If this is the same capability under another name, fold it in. If the automatic match is wrong, pick a different skill or keep this as its own card.
                </p>
              </div>

              {suggestedTarget && (
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => onMerge(suggestion, suggestedTarget)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-teal-500/35 bg-teal-500/15 px-3 py-2 text-left text-sm text-teal-50 hover:bg-teal-500/25 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">Merge with {suggestedTarget.name}</span>
                    <span className="block text-[10px] text-white/45">Suggested match — you can override this</span>
                  </span>
                  {adding ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Link2 className="h-4 w-4 shrink-0" />}
                </button>
              )}

              <label className="block">
                <span className="sr-only">Search Skills book to merge</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                  <input
                    type="search"
                    value={mergeQuery}
                    onChange={(event) => setMergeQuery(event.target.value)}
                    placeholder="Search skills to merge with…"
                    className="h-9 w-full rounded-md border border-white/15 bg-black/40 pl-8 pr-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
                  />
                </span>
              </label>

              {searchHits.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {searchHits.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        disabled={adding}
                        onClick={() => onMerge(suggestion, { id: entry.id, name: entry.name })}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-white">{entry.name}</span>
                          {entry.aliases && entry.aliases.length > 0 && (
                            <span className="block truncate text-[10px] text-white/40">
                              Also: {entry.aliases.slice(0, 3).join(', ')}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-white/70">Merge</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {normalize(mergeQuery).length > 0 && searchHits.length === 0 && (
                <p className="text-[11px] text-white/40">No matching Skills book entries.</p>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-4 sm:px-6">
          <button
            type="button"
            aria-label={
              isSimilarSuggestion(suggestion)
                ? `Keep ${suggestion.skill_name} as its own skill`
                : `Add ${suggestion.skill_name}`
            }
            onClick={() => onAdd(suggestion)}
            disabled={adding}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-teal-500/35 bg-teal-500/20 px-3 py-2 text-sm font-medium text-teal-50 hover:bg-teal-500/30 disabled:opacity-50"
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {isSimilarSuggestion(suggestion) ? 'Keep as its own skill' : 'Add to Skills book'}
              </>
            )}
          </button>
          <SuggestionDismissButton onDismiss={(reason) => onDismiss(suggestion, reason)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

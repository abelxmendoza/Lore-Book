import { useMemo, useState } from 'react';
import { Check, Link2, Loader2, Plus, Search, User, X } from 'lucide-react';

import type { CharacterSuggestion } from '../../api/entitySuggestions';
import type { SuggestionBookEntry } from '../../lib/suggestionMatchTypes';
import { isSimilarSuggestion, suggestionMatchedId, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { SuggestionDismissButton } from '../suggestions/SuggestionDismissButton';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import type { DismissSuggestionReason } from '../../api/suggestionDismiss';

export const CHARACTER_SUGGESTION_SOURCE_LABEL: Record<CharacterSuggestion['source'], string> = {
  omega_entity: 'Detected person',
  entity_question: 'Needs confirmation',
  chat_extract: 'From recent chats',
};

type MergeTarget = { id: string; name: string };

type Props = {
  suggestion: CharacterSuggestion;
  variant?: 'general' | 'romantic';
  adding?: boolean;
  bookEntries?: SuggestionBookEntry[];
  onClose: () => void;
  onAdd: (suggestion: CharacterSuggestion) => void;
  onMerge: (suggestion: CharacterSuggestion, target: MergeTarget) => void;
  onDismiss: (suggestion: CharacterSuggestion, reason?: DismissSuggestionReason) => void;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function CharacterSuggestionDetailModal({
  suggestion,
  variant = 'general',
  adding = false,
  bookEntries = [],
  onClose,
  onAdd,
  onMerge,
  onDismiss,
}: Props) {
  const romantic = variant === 'romantic';
  const [mergeQuery, setMergeQuery] = useState('');
  const addLabel = suggestionPrimaryActionLabel({
    item: suggestion,
    addLabel: romantic ? 'Add to love story' : 'Add to Character Book',
  });
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
        className={
          romantic
            ? 'sm:max-w-lg border-pink-500/30 bg-gradient-to-br from-pink-950/50 via-black to-black'
            : 'sm:max-w-lg border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-black to-black'
        }
      >
        <DialogHeader>
          <div className="flex min-w-0 items-start gap-3 pr-2">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                romantic
                  ? 'border-pink-400/30 bg-pink-500/15 text-pink-200'
                  : 'border-amber-400/30 bg-amber-500/15 text-amber-200'
              }`}
            >
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                {romantic ? 'Romantic interest suggestion' : 'Person suggestion'}
              </p>
              <DialogTitle className="mt-1 break-words text-xl leading-snug sm:text-2xl">
                {suggestion.name}
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
          <div className="flex flex-wrap gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                romantic
                  ? 'border-pink-500/25 bg-pink-500/15 text-pink-100'
                  : 'border-amber-500/25 bg-amber-500/15 text-amber-100'
              }`}
            >
              {CHARACTER_SUGGESTION_SOURCE_LABEL[suggestion.source]}
            </span>
            <SuggestionMergeHint item={suggestion} bookLabel="Character Book" />
            {suggestion.mentionCount > 0 && (
              <span className="text-[10px] text-white/45">
                {suggestion.mentionCount} mention{suggestion.mentionCount === 1 ? '' : 's'}
              </span>
            )}
            {typeof suggestion.confidence === 'number' && (
              <span className="text-[10px] text-white/45">
                {Math.round(suggestion.confidence * 100)}% confidence
              </span>
            )}
          </div>

          {suggestion.context && (
            <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
              {suggestion.context}
            </p>
          )}

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {suggestion.role && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Role</dt>
                <dd className="text-white/85">{suggestion.role}</dd>
              </div>
            )}
            {suggestion.archetype && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Archetype</dt>
                <dd className="capitalize text-white/85">{suggestion.archetype.replace(/_/g, ' ')}</dd>
              </div>
            )}
            {suggestion.relationship && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Relationship</dt>
                <dd className="capitalize text-white/85">{suggestion.relationship.replace(/_/g, ' ')}</dd>
              </div>
            )}
            {suggestion.matched_book_name && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Matched book entry</dt>
                <dd className="text-white/85">{suggestion.matched_book_name}</dd>
              </div>
            )}
          </dl>

          <SuggestionCategoryRedirect
            name={suggestion.name}
            fromDomain="characters"
            suggestionId={suggestion.id}
            alternatives={suggestion.alternative_categories}
            context={suggestion.context}
            disabled={adding}
            onReclassified={() => onDismiss(suggestion, 'wrong_book')}
          />

          {mergeable.length > 0 && (
            <section
              className={`rounded-lg border p-3 space-y-2.5 ${
                romantic
                  ? 'border-pink-500/20 bg-pink-500/5'
                  : 'border-amber-500/20 bg-amber-500/5'
              }`}
            >
              <div>
                <p className="text-xs font-semibold text-white/85 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Merge with someone already in your book
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                  If this is a nickname or alias, attach it to the existing person instead of creating a second card.
                </p>
              </div>

              {suggestedTarget && (
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => onMerge(suggestion, suggestedTarget)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50 ${
                    romantic
                      ? 'border-pink-500/35 bg-pink-500/15 text-pink-50 hover:bg-pink-500/25'
                      : 'border-amber-500/35 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">Merge with {suggestedTarget.name}</span>
                    <span className="block text-[10px] text-white/45">Suggested match</span>
                  </span>
                  {adding ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Link2 className="h-4 w-4 shrink-0" />}
                </button>
              )}

              <label className="block">
                <span className="sr-only">Search Character Book to merge</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                  <input
                    type="search"
                    value={mergeQuery}
                    onChange={(event) => setMergeQuery(event.target.value)}
                    placeholder="Search people to merge with…"
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
                <p className="text-[11px] text-white/40">No matching Character Book people.</p>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-4 sm:px-6">
          <button
            type="button"
            aria-label={`Add ${suggestion.name}`}
            onClick={() => onAdd(suggestion)}
            disabled={adding}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              romantic
                ? 'border-pink-500/35 bg-pink-500/20 text-pink-50 hover:bg-pink-500/30'
                : 'border-amber-500/35 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30'
            }`}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : isSimilarSuggestion(suggestion) ? (
              <>
                <Check className="h-4 w-4" />
                {addLabel}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {addLabel}
              </>
            )}
          </button>
          <SuggestionDismissButton onDismiss={(reason) => onDismiss(suggestion, reason)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

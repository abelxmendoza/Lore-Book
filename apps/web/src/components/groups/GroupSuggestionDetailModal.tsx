import { useMemo, useState } from 'react';
import { Check, Link2, Loader2, Search, Users, X } from 'lucide-react';

import { GROUP_TYPE_LABELS } from '../../lib/groupTypes';
import type { GroupType, UserRelationship } from '../organizations/OrganizationProfileCard';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

/** Book-grid preview cards dispatch this so the suggestion dialog opens instead of the created-group modal. */
export const OPEN_GROUP_SUGGESTION_EVENT = 'lorebook:open-group-suggestion';

export type GroupSuggestionDetail = {
  id: string;
  proposed_name?: string;
  detected_members: string[];
  suggested_group_type: GroupType;
  suggested_user_relationship: UserRelationship;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  context?: string;
};

type OrgOption = {
  id: string;
  name: string;
};

type Props = {
  suggestion: GroupSuggestionDetail;
  groupName: string;
  subtitle: string;
  processing?: boolean;
  orgOptions?: OrgOption[];
  onClose: () => void;
  onCreate: () => void;
  onMerge: (organizationId: string) => void;
  onDismiss: () => void;
};

const relationshipLabel = (value: UserRelationship): string =>
  value.replace(/_/g, ' ');

export function GroupSuggestionDetailModal({
  suggestion,
  groupName,
  subtitle,
  processing = false,
  orgOptions = [],
  onClose,
  onCreate,
  onMerge,
  onDismiss,
}: Props) {
  const [mergeQuery, setMergeQuery] = useState('');
  const typeLabel = GROUP_TYPE_LABELS[suggestion.suggested_group_type] ?? 'Group';

  const searchHits = useMemo(() => {
    const q = mergeQuery.trim().toLowerCase();
    if (q.length < 1) return orgOptions.slice(0, 8);
    return orgOptions
      .filter((entry) => entry.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mergeQuery, orgOptions]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onClose={onClose}
        className="sm:max-w-lg border-purple-500/30 bg-gradient-to-br from-purple-950/50 via-black to-black"
      >
        <DialogHeader>
          <div className="flex min-w-0 items-start gap-3 pr-2">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/15 text-purple-200">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Group suggestion
              </p>
              <DialogTitle className="mt-1 break-words text-xl leading-snug sm:text-2xl">
                {groupName}
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
            <span className="rounded border border-purple-500/25 bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-100">
              {typeLabel}
            </span>
            {suggestion.is_public_entity && (
              <span className="rounded border border-yellow-500/30 bg-yellow-500/15 px-1.5 py-0.5 text-[10px] text-yellow-200">
                Public
              </span>
            )}
            <span className="text-[10px] text-white/45">
              {Math.round(suggestion.confidence * 100)}% confidence
            </span>
            {suggestion.occurrence_count > 0 && (
              <span className="text-[10px] text-white/45">
                Seen {suggestion.occurrence_count} time{suggestion.occurrence_count === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed text-white/80">{subtitle}</p>

          {suggestion.context && (
            <p className="text-sm italic leading-relaxed text-white/60">
              &ldquo;{suggestion.context}&rdquo;
            </p>
          )}

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Your relationship</dt>
              <dd className="capitalize text-white/85">{relationshipLabel(suggestion.suggested_user_relationship)}</dd>
            </div>
            {suggestion.detected_members.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/40">Detected people</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {suggestion.detected_members.map((member) => (
                    <span
                      key={member}
                      className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-px text-[11px] text-white/75"
                    >
                      {member}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {orgOptions.length > 0 && (
          <section className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-white/85 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Merge with a group already in your book
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                If this is the same group under another name, attach it instead of creating a second card.
              </p>
            </div>

            <label className="block">
              <span className="sr-only">Search Groups book to merge</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                <input
                  type="search"
                  value={mergeQuery}
                  onChange={(event) => setMergeQuery(event.target.value)}
                  placeholder="Search groups to merge with…"
                  className="h-9 w-full rounded-md border border-white/15 bg-black/40 pl-8 pr-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
                />
              </span>
            </label>

            {searchHits.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {searchHits.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => onMerge(entry.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate text-sm text-white">{entry.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-white/70">Merge</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-white/40">No matching groups.</p>
            )}
          </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-4 sm:px-6">
          <button
            type="button"
            aria-label={`Create ${groupName}`}
            onClick={onCreate}
            disabled={processing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-purple-500/35 bg-purple-500/20 px-3 py-2 text-sm font-medium text-purple-50 hover:bg-purple-500/30 disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Create
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={processing}
            className="rounded-md border border-white/12 px-3 py-2 text-sm text-white/65 hover:bg-white/5 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

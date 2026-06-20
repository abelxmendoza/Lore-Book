import { Link2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { isSimilarSuggestion, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import type { SuggestionMatchFields } from '../../lib/suggestionMatchTypes';

type SuggestionMergeHintProps = {
  item: SuggestionMatchFields;
  bookLabel?: string;
  className?: string;
};

export function SuggestionMergeHint({ item, bookLabel = 'book', className }: SuggestionMergeHintProps) {
  if (!isSimilarSuggestion(item)) return null;
  const matched = suggestionMatchedName(item);
  return (
    <span
      className={cn(
        'text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25 inline-flex items-center gap-0.5 max-w-full',
        className
      )}
    >
      <Link2 className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">
        {matched
          ? `Possible duplicate — merge with ${matched} in your ${bookLabel}`
          : `Possible duplicate — review merge in your ${bookLabel}`}
      </span>
    </span>
  );
}

type SuggestionActionLabelProps = {
  item: SuggestionMatchFields;
  addLabel: string;
  mergeLabel?: string;
};

export function suggestionPrimaryActionLabel({
  item,
  addLabel,
  mergeLabel,
}: SuggestionActionLabelProps): string {
  if (!isSimilarSuggestion(item)) return addLabel;
  const matched = suggestionMatchedName(item);
  if (mergeLabel) return mergeLabel;
  return matched ? `Merge with ${matched}` : 'Review merge';
}

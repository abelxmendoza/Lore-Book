type MergeKeepOption = { id: string; name: string };

type Props = {
  visible: boolean;
  selectedCount: number;
  options: MergeKeepOption[];
  busy?: boolean;
  onKeep: (targetId: string) => void;
  hint?: string;
};

export function MergeKeepSelectionBar({
  visible,
  selectedCount,
  options,
  busy = false,
  onKeep,
  hint = 'Choose which name to keep — the others fold into it.',
}: Props) {
  if (!visible || options.length < 2) return null;

  return (
    <div
      className="fixed inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 bottom-0 sm:bottom-6 z-50 flex flex-col gap-3 rounded-2xl border border-primary/40 bg-gray-950/95 backdrop-blur px-4 sm:px-5 py-3 shadow-2xl max-w-lg"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="text-center sm:text-left">
        <p className="text-sm font-medium text-white">{selectedCount} selected</p>
        <p className="text-xs text-white/50 mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            onClick={() => onKeep(option.id)}
            className="rounded-xl bg-primary px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-primary/90 min-h-[44px] sm:min-h-0 touch-manipulation truncate max-w-full disabled:opacity-50"
          >
            Keep {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function mergeNoticeWithReview(
  mergedName: string,
  reviewCount: number,
  successDetail: string
): string {
  if (reviewCount > 0) {
    return `Merged into ${mergedName}. ${reviewCount} snippet${reviewCount === 1 ? '' : 's'} flagged for review on the card.`;
  }
  return `Merged into ${mergedName} — ${successDetail}`;
}

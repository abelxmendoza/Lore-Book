import type { EntitySearchResult } from '../../../api/entitySearch';
import { ENTITY_SEARCH_TYPE_LABELS } from '../../../api/entitySearch';

type EntityLinkConfirmationProps = {
  spanText: string;
  result: EntitySearchResult;
  onConfirm: () => void;
  onCancel: () => void;
};

export function EntityLinkConfirmation({
  spanText,
  result,
  onConfirm,
  onCancel,
}: EntityLinkConfirmationProps) {
  const typeLabel = ENTITY_SEARCH_TYPE_LABELS[result.entityType] ?? result.entityType;

  return (
    <div
      className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2.5 space-y-2"
      data-testid="entity-link-confirmation"
    >
      <p className="text-[10px] text-white/50 uppercase tracking-wide">Confirm link</p>
      <p className="text-xs text-white">
        Link <span className="font-semibold">&ldquo;{spanText}&rdquo;</span> to{' '}
        <span className="font-semibold text-violet-200">{result.displayName}</span>?
      </p>
      <p className="text-[10px] text-white/45">
        {typeLabel} · {result.knownStatus === 'known' ? 'Known in LoreBook' : 'Pending suggestion'}
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          data-testid="entity-link-confirm"
          onClick={onConfirm}
          className="flex-1 px-2 py-1.5 rounded-md bg-violet-500/25 text-violet-100 text-[10px] font-medium"
        >
          Link entity
        </button>
        <button
          type="button"
          data-testid="entity-link-cancel"
          onClick={onCancel}
          className="px-2 py-1.5 rounded-md bg-white/8 text-white/60 text-[10px]"
        >
          Back
        </button>
      </div>
    </div>
  );
}

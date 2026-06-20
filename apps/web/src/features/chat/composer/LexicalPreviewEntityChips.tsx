import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { ENTITY_COLOR_MAP, colorKeyForPreviewType } from '../../../lib/entityColorMap';
import { displayStatus } from '../../../lib/correctedPreviewSpanReducer';
import { CompactChipStrip, CompactEntityChip } from '../components/CompactEntityChip';

type LexicalPreviewEntityChipsProps = {
  spans: LexicalPreviewSpan[];
  correctedRecords?: CorrectedPreviewSpan[];
  onSelectSpan?: (span: LexicalPreviewSpan) => void;
};

function chipLabel(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): string {
  const typeLabel = corrected?.correctedSubtype ?? corrected?.correctedType ?? span.subtype ?? span.type;
  const text = corrected?.displayNameOverride ?? span.text;
  return `${text}: ${typeLabel}`;
}

function chipClass(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): string {
  const type = corrected?.correctedType ?? span.type;
  const colorKey = colorKeyForPreviewType(type, corrected?.colorKey ?? span.colorKey);
  const palette = ENTITY_COLOR_MAP[colorKey]?.chip ?? ENTITY_COLOR_MAP.uncertain.chip;
  const status = displayStatus(corrected ?? { entityStatus: span.entityStatus ?? 'new' } as CorrectedPreviewSpan);
  if (status === 'confirmed' || status === 'known') return palette;
  if (status === 'ignored' || status === 'wrong') return `${palette} opacity-40 line-through`;
  return `${palette} border-dashed opacity-90`;
}

function chipTitle(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): string {
  const type = corrected?.correctedType ?? span.type;
  const colorKey = colorKeyForPreviewType(type, corrected?.colorKey ?? span.colorKey);
  const label = ENTITY_COLOR_MAP[colorKey]?.label ?? type;
  const status = displayStatus(corrected ?? { entityStatus: span.entityStatus ?? 'new' } as CorrectedPreviewSpan);
  const review = (corrected?.requiresReview ?? span.needsReview) ? ' · needs review' : '';
  const parent = corrected?.parentEntityName ?? span.parentContext;
  const parentNote = parent ? ` · ${parent.replace(/^PARENT:\s*/i, '')}` : '';
  return `${span.text} (${label}, ${status}${review}${parentNote})`;
}

/** Preview-detected entities as compact, clickable chips. */
export function LexicalPreviewEntityChips({
  spans,
  correctedRecords = [],
  onSelectSpan,
}: LexicalPreviewEntityChipsProps) {
  if (spans.length === 0) return null;

  const correctedByKey = new Map(
    correctedRecords.map((c) => [`${c.start}:${c.end}`, c])
  );

  const knownCount = spans.filter((s) => s.entityStatus === 'known').length;
  const stripLabel =
    knownCount === spans.length
      ? 'Detected — all known in LoreBook'
      : knownCount > 0
        ? `Detected — ${knownCount} known, ${spans.length - knownCount} new`
        : 'Detected — tap to correct';

  return (
    <div data-testid="lexical-preview-entity-chips" className="mt-1 px-0.5">
      <CompactChipStrip label={stripLabel}>
        {spans.map((span) => {
          const corrected = correctedByKey.get(`${span.start}:${span.end}`);
          return (
            <CompactEntityChip
              key={`${span.start}:${span.end}:${span.type}`}
              data-testid={`lexical-preview-chip-${span.type}-${span.start}`}
              data-entity-status={corrected ? displayStatus(corrected) : span.entityStatus ?? 'new'}
              title={chipTitle(span, corrected)}
              className={chipClass(span, corrected)}
              onClick={onSelectSpan ? () => onSelectSpan(span) : undefined}
            >
              <span className="truncate">{chipLabel(span, corrected)}</span>
            </CompactEntityChip>
          );
        })}
      </CompactChipStrip>
    </div>
  );
}

import { X } from 'lucide-react';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { filterPreviewSpansForStrip } from '../../../lib/composerEntityStrip';
import { colorKeyForPreviewType, previewChipClass as previewChipClasses } from '../../../lib/entityColorMap';
import { displayStatus } from '../../../lib/correctedPreviewSpanReducer';
import {
  getLoreEntity,
  loreKindForChip,
  type LoreEntityKind,
} from '../../../lib/loreEntities';
import { chipColorForEntity } from '../../../lib/entityTypeColors';
import { composerMatchSlot } from '../../../store/slices/composerSlice';
import { CompactEntityChip, CompactChipStrip, SplitEntityChip } from '../components/CompactEntityChip';

type ComposerEntityChipsProps = {
  text?: string;
  entities: CertifiedEntityMatch[];
  previewSpans?: LexicalPreviewSpan[];
  correctedRecords?: CorrectedPreviewSpan[];
  confirmingSlots?: string[];
  onDismiss?: (entity: CertifiedEntityMatch) => void;
  onConfirm?: (entity: CertifiedEntityMatch) => void;
  onSelectPreviewSpan?: (span: LexicalPreviewSpan) => void;
  onConfirmPreviewSpan?: (span: LexicalPreviewSpan) => void;
  variant?: 'bar' | 'inline';
  scanning?: boolean;
  max?: number;
};

const PREVIEW_COLOR_TO_KIND: Partial<Record<string, LoreEntityKind>> = {
  person: 'person',
  relationship: 'relationship',
  place: 'place',
  organization: 'organization',
  group: 'group',
  skill: 'skill',
  project: 'project',
  event: 'event',
};

function isConfirmable(entity: CertifiedEntityMatch): boolean {
  if (entity.lifecycleStatus === 'archived') return true;
  return entity.status === 'suggestion' || entity.status === 'draft';
}

function chipDisplayName(entity: CertifiedEntityMatch): string {
  if (entity.actionLabel) return entity.actionLabel;
  return entity.matchedLabel ?? entity.name;
}

function certifiedChipTitle(entity: CertifiedEntityMatch): string {
  const def = getLoreEntity(loreKindForChip(entity));
  if (entity.lifecycleStatus === 'archived') {
    return `${chipDisplayName(entity)} · ${def.label} · archived — tap ✓ to restore`;
  }
  const status =
    entity.status === 'draft'
      ? 'new — tap to add'
      : entity.status === 'suggestion'
        ? 'detected — tap ✓ to confirm'
        : 'in your books';
  return `${chipDisplayName(entity)} · ${def.label} · ${status}`;
}

function previewChipClass(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): string {
  const type = corrected?.correctedType ?? span.type;
  const colorKey = colorKeyForPreviewType(type, corrected?.colorKey ?? span.colorKey);
  const status = displayStatus(corrected ?? { entityStatus: span.entityStatus ?? 'new' } as CorrectedPreviewSpan);
  if (status === 'ignored' || status === 'wrong') {
    return `${previewChipClasses(colorKey, span.needsReview, span.entityStatus)} opacity-40 line-through`;
  }
  return previewChipClasses(
    colorKey,
    span.needsReview,
    status === 'confirmed' || status === 'known' ? 'known' : 'new',
  );
}

function previewChipTitle(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): string {
  const type = corrected?.correctedType ?? span.type;
  const colorKey = colorKeyForPreviewType(type, corrected?.colorKey ?? span.colorKey);
  const kind = PREVIEW_COLOR_TO_KIND[colorKey] ?? 'person';
  const status = displayStatus(corrected ?? { entityStatus: span.entityStatus ?? 'new' } as CorrectedPreviewSpan);
  return `${span.text} · ${getLoreEntity(kind).label} · ${status}${span.needsReview ? ' · review' : ''}`;
}

function isPreviewConfirmable(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): boolean {
  const status = corrected
    ? displayStatus(corrected)
    : span.entityStatus === 'known'
      ? 'known'
      : span.entityStatus ?? 'new';
  return status !== 'confirmed' && status !== 'known' && status !== 'ignored' && status !== 'wrong';
}

/**
 * One compact row above the composer — certified book matches + lexical preview, deduped.
 */
export const ComposerEntityChips = ({
  text = '',
  entities,
  previewSpans = [],
  correctedRecords = [],
  confirmingSlots = [],
  onDismiss,
  onConfirm,
  onSelectPreviewSpan,
  onConfirmPreviewSpan,
  variant = 'bar',
  scanning = false,
  max = 6,
}: ComposerEntityChipsProps) => {
  const chipEntities = entities.filter((e) => e.matchKind !== 'prefix');
  const dedupedPreview = filterPreviewSpansForStrip(text, chipEntities, previewSpans);
  const correctedByKey = new Map(correctedRecords.map((c) => [`${c.start}:${c.end}`, c]));

  if (chipEntities.length === 0 && dedupedPreview.length === 0) return null;

  const previewItems = dedupedPreview.map((span) => ({
    key: `preview:${span.start}:${span.end}`,
    span,
    corrected: correctedByKey.get(`${span.start}:${span.end}`),
  }));

  const needsConfirm =
    chipEntities.some(isConfirmable) ||
    previewItems.some(({ span, corrected }) => isPreviewConfirmable(span, corrected) && onConfirmPreviewSpan);
  const hasArchived = chipEntities.some((e) => e.lifecycleStatus === 'archived');
  const stripLabel = scanning
    ? 'Scanning…'
    : hasArchived
      ? 'Tap ✓ to restore archived'
      : needsConfirm
        ? 'Tap ✓ to confirm'
        : 'In message';

  const totalCount = chipEntities.length + previewItems.length;
  const certifiedVisible = chipEntities.slice(0, max);
  const previewVisible = previewItems.slice(0, Math.max(0, max - certifiedVisible.length));
  const overflow = totalCount - certifiedVisible.length - previewVisible.length;

  const strip = (
    <CompactChipStrip label={stripLabel}>
      {certifiedVisible.map((entity) => {
        const loreKind = loreKindForChip(entity);
        const Icon = getLoreEntity(loreKind).icon;
        const slot = composerMatchSlot(entity);
        const confirming = confirmingSlots.includes(slot);
        const canConfirm = isConfirmable(entity) && onConfirm;
        const chipTestId = `composer-entity-chip-${entity.type}-${entity.id}`;
        const chipClass =
          entity.lifecycleStatus === 'archived'
            ? 'border-white/20 bg-white/5 text-white/55'
            : chipColorForEntity(entity);

        if (canConfirm) {
          return (
            <span key={slot} className="inline-flex shrink-0 items-center">
              <SplitEntityChip
                data-testid={chipTestId}
                label={chipDisplayName(entity)}
                title={certifiedChipTitle(entity)}
                className={chipClass}
                icon={<Icon className="h-2 w-2 flex-shrink-0 opacity-75" />}
                onConfirm={() => onConfirm(entity)}
                confirming={confirming}
                confirmAriaLabel={
                  entity.lifecycleStatus === 'archived'
                    ? `Restore ${entity.name}`
                    : `Confirm ${entity.name}`
                }
              />
              {onDismiss && (
                <button
                  type="button"
                  data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
                  className="-ml-0.5 rounded-full p-px text-white/30 hover:text-white/55 touch-manipulation"
                  aria-label={`Dismiss ${entity.name}`}
                  onClick={() => onDismiss(entity)}
                >
                  <X className="h-2 w-2" />
                </button>
              )}
            </span>
          );
        }

        return (
          <span key={slot} className="inline-flex shrink-0 items-center">
            <CompactEntityChip
              data-testid={chipTestId}
              title={certifiedChipTitle(entity)}
              className={chipColorForEntity(entity)}
            >
              <Icon className="h-2 w-2 flex-shrink-0 opacity-75" />
              <span className="truncate">{chipDisplayName(entity)}</span>
            </CompactEntityChip>
            {onDismiss && (
              <button
                type="button"
                data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
                className="-ml-0.5 rounded-full p-px text-white/30 hover:text-white/55 touch-manipulation"
                aria-label={`Dismiss ${entity.name}`}
                onClick={() => onDismiss(entity)}
              >
                <X className="h-2 w-2" />
              </button>
            )}
          </span>
        );
      })}

      {previewVisible.map(({ key, span, corrected }) => {
        const chipClass = previewChipClass(span, corrected);
        const chipTitle = previewChipTitle(span, corrected);
        const testId = `lexical-preview-chip-${span.type}-${span.start}`;
        const canQuickConfirm =
          isPreviewConfirmable(span, corrected) && Boolean(onConfirmPreviewSpan);

        if (canQuickConfirm) {
          return (
            <SplitEntityChip
              key={key}
              data-testid={testId}
              label={span.text}
              title={chipTitle}
              className={chipClass}
              onOpen={onSelectPreviewSpan ? () => onSelectPreviewSpan(span) : undefined}
              onConfirm={() => onConfirmPreviewSpan!(span)}
              openAriaLabel={`Edit ${span.text}`}
              confirmAriaLabel={`Confirm ${span.text}`}
            />
          );
        }

        return (
          <CompactEntityChip
            key={key}
            data-testid={testId}
            data-entity-status={corrected ? displayStatus(corrected) : span.entityStatus ?? 'new'}
            title={chipTitle}
            className={chipClass}
            onClick={onSelectPreviewSpan ? () => onSelectPreviewSpan(span) : undefined}
          >
            <span className="truncate">{span.text}</span>
          </CompactEntityChip>
        );
      })}

      {overflow > 0 && (
        <span className="text-[9px] text-white/30 shrink-0 px-0.5">+{overflow}</span>
      )}
    </CompactChipStrip>
  );

  if (variant === 'inline') {
    return (
      <div data-testid="composer-entity-chips" className="composer-entity-chips-inline">
        {strip}
      </div>
    );
  }

  return (
    <div
      data-testid="composer-entity-chips"
      className="border-b border-white/[0.04] bg-black/25 px-3 py-0.5 sm:px-4 lg:px-10 xl:px-12"
    >
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
        {strip}
      </div>
    </div>
  );
};

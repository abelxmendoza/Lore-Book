import { X } from 'lucide-react';

import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { filterPreviewSpansForStrip, dedupeCertifiedForStrip } from '../../../lib/composerEntityStrip';
import { displayStatus } from '../../../lib/correctedPreviewSpanReducer';
import { colorKeyForPreviewType, previewChipClass as previewChipClasses } from '../../../lib/entityColorMap';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { chipColorForEntity } from '../../../lib/entityTypeColors';
import {
  getLoreEntity,
  loreKindForChip,
  type LoreEntityKind,
} from '../../../lib/loreEntities';
import { displayChipName } from '../../../lib/selfChipLabel';
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
  onDismissPreviewSpan?: (span: LexicalPreviewSpan) => void;
  variant?: 'bar' | 'inline';
  scanning?: boolean;
  max?: number;
  includedSlots?: string[];
  onToggleIncluded?: (slot: string) => void;
};

const PREVIEW_COLOR_TO_KIND: Partial<Record<string, LoreEntityKind>> = {
  person: 'person',
  relationship: 'relationship',
  place: 'place',
  organization: 'organization',
  group: 'group',
  thing: 'thing',
  skill: 'skill',
  project: 'project',
  event: 'event',
};

// Only these chip kinds are surfaced above the composer right now:
// people/pets, places/locations, groups/orgs, projects, and significant things.
// Everything else (skills, events, memories) is hidden from the strip.
const ALLOWED_CHIP_KINDS = new Set<LoreEntityKind>([
  'person',
  'pet',
  'relationship',
  'place',
  'organization',
  'group',
  'thing',
  'project',
]);

function previewSpanKind(span: LexicalPreviewSpan, corrected?: CorrectedPreviewSpan): LoreEntityKind {
  const type = corrected?.correctedType ?? span.type;
  const colorKey = colorKeyForPreviewType(type, corrected?.colorKey ?? span.colorKey);
  return PREVIEW_COLOR_TO_KIND[colorKey] ?? 'person';
}

function isConfirmable(entity: CertifiedEntityMatch): boolean {
  if (entity.composerChipKind === 'growing_entity') return false;
  if (entity.lifecycleStatus === 'archived') return true;
  return entity.status === 'suggestion' || entity.status === 'draft';
}

function chipDisplayName(entity: CertifiedEntityMatch): string {
  if (entity.actionLabel) return entity.actionLabel;
  const raw = entity.matchedLabel ?? entity.name;
  // "And You" / "Also You" sentence bleed → "You (Firstname)" (or "You").
  return displayChipName(raw, {
    name: entity.name,
    metadata: (entity as { metadata?: Record<string, unknown> }).metadata,
  });
}

function certifiedChipTitle(entity: CertifiedEntityMatch): string {
  const def = getLoreEntity(loreKindForChip(entity));
  if (entity.lifecycleStatus === 'archived') {
    return `${chipDisplayName(entity)} · ${def.label} · archived — tap ✓ to restore`;
  }
  const status =
    entity.composerChipKind === 'growing_entity'
      ? `growing context${entity.mentionCount ? ` · ${entity.mentionCount} mention${entity.mentionCount === 1 ? '' : 's'}` : ''}`
      : entity.promotionStage === 'growing'
        ? 'growing context'
        : entity.promotionStage === 'suggest'
          ? 'ready to add'
          : entity.status === 'draft'
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
  onDismissPreviewSpan,
  variant = 'bar',
  scanning = false,
  max = 6,
  includedSlots = [],
  onToggleIncluded,
}: ComposerEntityChipsProps) => {
  const correctedByKey = new Map(correctedRecords.map((c) => [`${c.start}:${c.end}`, c]));

  // Only surface people/characters, places/locations, organizations, and groups.
  const chipEntities = dedupeCertifiedForStrip(entities).filter((e) =>
    ALLOWED_CHIP_KINDS.has(loreKindForChip(e)),
  );
  const dedupedPreview = filterPreviewSpansForStrip(text, chipEntities, previewSpans).filter((span) =>
    ALLOWED_CHIP_KINDS.has(previewSpanKind(span, correctedByKey.get(`${span.start}:${span.end}`))),
  );

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
  const hasGrowing = chipEntities.some((e) => e.composerChipKind === 'growing_entity' || e.promotionStage === 'growing');
  const stripLabel = scanning
    ? 'Scanning…'
    : hasArchived
      ? 'Tap ✓ to restore archived'
      : needsConfirm
        ? 'Tap chip or ✓ to include'
        : hasGrowing
          ? 'Growing context'
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
        const included = includedSlots.includes(slot);
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
                className={`${chipClass}${included ? ' ring-1 ring-emerald-400/70' : ''}`}
                icon={<Icon className="h-2 w-2 flex-shrink-0 opacity-75" />}
                onOpen={onToggleIncluded ? () => onToggleIncluded(slot) : undefined}
                onConfirm={() => {
                  onConfirm!(entity);
                  onToggleIncluded?.(slot);
                }}
                confirming={confirming}
                confirmAriaLabel={
                  entity.lifecycleStatus === 'archived'
                    ? `Restore ${entity.name}`
                    : `Confirm ${entity.name}`
                }
                openAriaLabel={`Toggle ${entity.name} in message`}
              />
              {onDismiss && (
                <button
                  type="button"
                  data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
                  className="-ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/90 active:bg-white/15 touch-manipulation"
                  aria-label={`Dismiss ${entity.name}`}
                  onClick={() => onDismiss(entity)}
                >
                  <X className="h-3 w-3" />
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
              selected={included}
              onClick={onToggleIncluded ? () => onToggleIncluded(slot) : undefined}
            >
              <Icon className="h-2 w-2 flex-shrink-0 opacity-75" />
              <span className="truncate">{chipDisplayName(entity)}</span>
            </CompactEntityChip>
            {onDismiss && (
              <button
                type="button"
                data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
                className="-ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/90 active:bg-white/15 touch-manipulation"
                aria-label={`Dismiss ${entity.name}`}
                onClick={() => onDismiss(entity)}
              >
                <X className="h-3 w-3" />
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

        const dismissPreviewButton = onDismissPreviewSpan && (
          <button
            type="button"
            data-testid={`lexical-preview-dismiss-${span.type}-${span.start}`}
            className="-ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/90 active:bg-white/15 touch-manipulation"
            aria-label={`Dismiss ${span.text}`}
            onClick={() => onDismissPreviewSpan(span)}
          >
            <X className="h-3 w-3" />
          </button>
        );

        if (canQuickConfirm) {
          return (
            <span key={key} className="inline-flex shrink-0 items-center">
              <SplitEntityChip
                data-testid={testId}
                label={span.text}
                title={chipTitle}
                className={chipClass}
                onOpen={onSelectPreviewSpan ? () => onSelectPreviewSpan(span) : undefined}
                onConfirm={() => onConfirmPreviewSpan!(span)}
                openAriaLabel={`Edit ${span.text}`}
                confirmAriaLabel={`Confirm ${span.text}`}
              />
              {dismissPreviewButton}
            </span>
          );
        }

        return (
          <span key={key} className="inline-flex shrink-0 items-center">
            <CompactEntityChip
              data-testid={testId}
              data-entity-status={corrected ? displayStatus(corrected) : span.entityStatus ?? 'new'}
              title={chipTitle}
              className={chipClass}
              onClick={onSelectPreviewSpan ? () => onSelectPreviewSpan(span) : undefined}
            >
              <span className="truncate">{span.text}</span>
            </CompactEntityChip>
            {dismissPreviewButton}
          </span>
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

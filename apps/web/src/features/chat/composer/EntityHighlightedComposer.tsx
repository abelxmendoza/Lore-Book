import { useMemo, useRef, useCallback, useState, useEffect, type CSSProperties, type KeyboardEvent, type RefObject, type ReactNode } from 'react';
import { Textarea } from '../../../components/ui/textarea';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { findEntityHighlightRanges } from '../../../lib/entityHighlightRanges';
import { inlineMarkClassForEntity } from '../../../lib/entityTypeColors';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { useEntityCorrectionState } from '../../../hooks/useEntityCorrectionState';
import { filterPreviewSpansForStrip } from '../../../lib/composerEntityStrip';
import { EntityHighlightSpan } from './EntityHighlightSpan';
import { EntityClassificationPopover } from './EntityClassificationPopover';

type EntityCorrectionState = ReturnType<typeof useEntityCorrectionState>;

type EntityHighlightedComposerProps = {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  matches: CertifiedEntityMatch[];
  threadId?: string;
  correction?: EntityCorrectionState;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPreviewCorrectionsChange?: (corrections: CorrectedPreviewSpan[]) => void;
};

type HighlightSegment =
  | { kind: 'plain'; start: number; end: number }
  | { kind: 'certified'; start: number; end: number; match: CertifiedEntityMatch }
  | { kind: 'preview'; start: number; end: number; span: LexicalPreviewSpan };

function buildSegments(
  text: string,
  matches: CertifiedEntityMatch[],
  previewSpans: LexicalPreviewSpan[]
): HighlightSegment[] {
  const certifiedRanges = findEntityHighlightRanges(text, matches);
  const segments: HighlightSegment[] = [];

  for (const range of certifiedRanges) {
    segments.push({ kind: 'certified', start: range.start, end: range.end, match: range.match });
  }

  for (const span of previewSpans) {
    const overlapsCertified = certifiedRanges.some(
      (r) => span.start < r.end && span.end > r.start
    );
    if (!overlapsCertified) {
      segments.push({ kind: 'preview', start: span.start, end: span.end, span });
    }
  }

  if (segments.length === 0) return [];

  const boundaries = new Set<number>([0, text.length]);
  for (const s of segments) {
    boundaries.add(s.start);
    boundaries.add(s.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const result: HighlightSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start >= end) continue;

    const covering = segments.filter((s) => s.start <= start && s.end >= end);
    if (covering.length === 0) {
      result.push({ kind: 'plain', start, end });
      continue;
    }

    const certified = covering.find((s) => s.kind === 'certified');
    if (certified && certified.kind === 'certified') {
      result.push({ kind: 'certified', start, end, match: certified.match });
      continue;
    }

    const preview = covering.find((s) => s.kind === 'preview');
    if (preview && preview.kind === 'preview') {
      result.push({ kind: 'preview', start, end, span: preview.span });
      continue;
    }

    result.push({ kind: 'plain', start, end });
  }

  return result;
}

export const EntityHighlightedComposer = ({
  value,
  onChange,
  textareaRef,
  matches,
  threadId,
  correction: correctionProp,
  placeholder,
  disabled,
  className = '',
  style,
  onFocus,
  onBlur,
  onKeyDown,
  onPreviewCorrectionsChange,
}: EntityHighlightedComposerProps) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const internalCorrection = useEntityCorrectionState(value, threadId, matches);
  const correction = correctionProp ?? internalCorrection;

  const {
    visibleSpans: spans,
    activeCorrectedSpan,
    openSpan,
    closeActiveSpan,
    applyAction,
    sendPayload,
    inferredAssociations,
  } = correction;

  useEffect(() => {
    onPreviewCorrectionsChange?.(sendPayload);
  }, [sendPayload, onPreviewCorrectionsChange]);

  const filteredSpans = useMemo(
    () => filterPreviewSpansForStrip(value, matches, spans),
    [value, matches, spans]
  );

  const segments = useMemo(
    () => buildSegments(value, matches, filteredSpans),
    [value, matches, filteredSpans]
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!textarea || !backdrop) return;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }, [textareaRef]);

  const showHighlights =
    (matches.length > 0 || filteredSpans.length > 0) && value.trim().length > 0;

  const highlighted: ReactNode = useMemo(() => {
    if (!showHighlights) return value;
    return segments.map((seg) => {
      const slice = value.slice(seg.start, seg.end);
      if (seg.kind === 'plain') {
        return (
          <span key={`plain-${seg.start}`} className="text-white/90">
            {slice}
          </span>
        );
      }
      if (seg.kind === 'certified') {
        return (
          <mark
            key={`cert-${seg.start}`}
            data-testid={`composer-entity-highlight-${seg.match.type}-${seg.match.id}`}
            className={inlineMarkClassForEntity(seg.match)}
            title={`${seg.match.name} — known in LoreBook`}
          >
            {slice}
          </mark>
        );
      }
      return (
        <EntityHighlightSpan
          key={`prev-${seg.start}`}
          span={seg.span}
          onSelect={(s) => openSpan(s, 'composer')}
        >
          {slice}
        </EntityHighlightSpan>
      );
    });
  }, [segments, showHighlights, value, openSpan]);

  return (
    <div className="journal-composer-highlight-host" data-testid="entity-highlighted-composer">
      {showHighlights && (
        <div
          ref={backdropRef}
          aria-hidden
          className={`composer-highlight-layer pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words ${className}`}
        >
          {highlighted}
        </div>
      )}

      {activeCorrectedSpan && (
        <div ref={popoverRef} className="composer-entity-popover z-[3]">
          <EntityClassificationPopover
            span={activeCorrectedSpan}
            composerText={value}
            inferredAssociations={inferredAssociations.map((a) => a.label)}
            onAction={applyAction}
            onClose={closeActiveSpan}
          />
        </div>
      )}

      <Textarea
        ref={textareaRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        className={[
          className,
          showHighlights ? 'composer-highlight-input relative z-[1] !bg-transparent' : '',
        ].join(' ')}
        style={style}
        spellCheck
      />
    </div>
  );
};

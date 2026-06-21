import type { ReactNode } from 'react';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';
import { colorKeyForPreviewType, inlineMarkClassForPreview } from '../../../lib/entityColorMap';

type EntityHighlightSpanProps = {
  span: LexicalPreviewSpan;
  children: ReactNode;
  onSelect?: (span: LexicalPreviewSpan) => void;
};

export function EntityHighlightSpan({ span, children, onSelect }: EntityHighlightSpanProps) {
  const colorKey = colorKeyForPreviewType(span.type, span.colorKey);
  const statusLabel = span.entityStatus === 'known' ? 'known in LoreBook' : 'new — not yet saved';
  const matched = span.matchedEntityName ? ` · matches ${span.matchedEntityName}` : '';

  return (
    <mark
      data-testid={`lexical-preview-span-${span.type}-${span.start}`}
      data-entity-status={span.entityStatus ?? 'new'}
      className={inlineMarkClassForPreview(colorKey, span.needsReview, span.entityStatus)}
      title={`${span.text} · ${Math.round(span.confidence * 100)}% · ${statusLabel}${matched} · preview`}
      onClick={(e) => {
        e.preventDefault();
        onSelect?.(span);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(span);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {children}
    </mark>
  );
}

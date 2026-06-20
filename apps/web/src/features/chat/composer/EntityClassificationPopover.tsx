import { useState, useEffect } from 'react';
import type { CorrectedPreviewSpan, EntityCorrectionAction } from '../../../lib/entityCorrectionTypes';
import { EntityCorrectionMenu } from './EntityCorrectionMenu';
import { EntityLinkPicker } from './EntityLinkPicker';
import { EntityIntelligenceWhy } from './EntityIntelligenceWhy';
import { fetchLexicalDebug, isLexicalDebugEnabled, type LexicalIntelligenceSpan } from '../../../api/lexicalDebug';

type Props = {
  span: CorrectedPreviewSpan;
  composerText?: string;
  inferredAssociations?: string[];
  onAction: (action: EntityCorrectionAction) => void;
  onClose: () => void;
};

export function EntityClassificationPopover({
  span,
  composerText = '',
  inferredAssociations = [],
  onAction,
  onClose,
}: Props) {
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [intelSpan, setIntelSpan] = useState<LexicalIntelligenceSpan | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const displayText = span.displayNameOverride ?? span.text;

  useEffect(() => {
    if (!isLexicalDebugEnabled() || linkPickerOpen || !composerText.trim()) return;
    let cancelled = false;
    setIntelLoading(true);
    fetchLexicalDebug(composerText, { includeAlternatives: true })
      .then((report) => {
        if (cancelled) return;
        const match =
          report.spans.find((s) => s.start === span.start && s.end === span.end) ??
          report.spans.find((s) => s.text.toLowerCase() === span.text.toLowerCase());
        setIntelSpan(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setIntelSpan(null);
      })
      .finally(() => {
        if (!cancelled) setIntelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [composerText, span.start, span.end, span.text, linkPickerOpen]);

  return (
    <div
      className="w-80 rounded-xl border border-white/15 bg-[#14141c] shadow-2xl p-3 text-xs max-h-[70vh] overflow-y-auto"
      data-testid="entity-classification-popover"
      role="dialog"
      aria-label="Entity classification"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Preview · training layer</p>
          <p className="text-sm font-semibold text-white mt-0.5">&ldquo;{displayText}&rdquo;</p>
          <p className="text-[10px] text-white/35 mt-0.5">Source phrase in composer</p>
          {span.linkedEntityName && (
            <p className="text-[10px] text-emerald-300/80 mt-1" data-testid="entity-linked-label">
              Linked to {span.linkedEntityName}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70 px-1" aria-label="Close">
          ×
        </button>
      </div>

      {(span.sensitive || span.requiresReview) && (
        <p className="text-amber-300/90 text-[10px] mb-2 border border-amber-500/25 bg-amber-500/10 rounded-md px-2 py-1">
          {span.sensitive ? 'Marked sensitive — review required before truth write' : 'Needs review before send'}
        </p>
      )}

      {inferredAssociations.length > 0 && (
        <ul className="mb-2 space-y-0.5 text-[10px] text-white/55">
          {inferredAssociations.slice(0, 4).map((a) => (
            <li key={a}>↳ {a}</li>
          ))}
        </ul>
      )}

      {linkPickerOpen ? (
        <EntityLinkPicker
          span={span}
          onAction={onAction}
          onClose={() => setLinkPickerOpen(false)}
        />
      ) : (
        <EntityCorrectionMenu
          span={span}
          onAction={onAction}
          onOpenLinkPicker={() => setLinkPickerOpen(true)}
        />
      )}

      {isLexicalDebugEnabled() && !linkPickerOpen && (
        <EntityIntelligenceWhy
          spanText={displayText}
          intelligence={intelSpan}
          loading={intelLoading}
        />
      )}
    </div>
  );
}

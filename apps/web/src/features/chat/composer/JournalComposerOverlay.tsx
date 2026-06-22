import { useEffect, useRef } from 'react';
import { Send, Loader2, X } from 'lucide-react';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import type { useEntityCorrectionState } from '../../../hooks/useEntityCorrectionState';
import { EntityHighlightedComposer } from './EntityHighlightedComposer';
import { ComposerEntityChips } from './ComposerEntityChips';
import { getComposerStats } from '../hooks/useVisualViewportSize';

type EntityCorrectionState = ReturnType<typeof useEntityCorrectionState>;

type JournalComposerOverlayProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  matches: CertifiedEntityMatch[];
  threadId?: string;
  correction: EntityCorrectionState;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  onSubmit: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPreviewCorrectionsChange?: (corrections: CorrectedPreviewSpan[]) => void;
  viewportHeight: number;
  keyboardInset: number;
  confirmingSlots?: string[];
  includedSlots?: string[];
  onToggleIncluded?: (slot: string) => void;
  onDismiss?: (entity: CertifiedEntityMatch) => void;
  onConfirm?: (entity: CertifiedEntityMatch) => void;
};

export const JournalComposerOverlay = ({
  open,
  onClose,
  value,
  onChange,
  textareaRef,
  matches,
  threadId,
  correction,
  placeholder,
  disabled,
  loading,
  onSubmit,
  onKeyDown,
  onPreviewCorrectionsChange,
  viewportHeight,
  keyboardInset,
  confirmingSlots = [],
  includedSlots = [],
  onToggleIncluded,
  onDismiss,
  onConfirm,
}: JournalComposerOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const stats = getComposerStats(value);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, textareaRef]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const panelHeight = Math.max(320, viewportHeight - keyboardInset);

  return (
    <div
      className="journal-composer-overlay sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Journal writing mode"
      data-testid="journal-composer-overlay"
    >
      <button
        type="button"
        className="journal-composer-overlay__backdrop"
        onClick={onClose}
        aria-label="Close journal mode"
      />
      <div
        ref={overlayRef}
        className="journal-composer-overlay__panel"
        style={{
          height: panelHeight,
          paddingBottom: keyboardInset > 0 ? keyboardInset : undefined,
        }}
      >
        <div className="journal-composer-overlay__header">
          <div>
            <p className="journal-composer-overlay__title">Write your story</p>
            <p className="journal-composer-overlay__subtitle">
              Enter adds a new line · Tap Send when you&apos;re done
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="journal-composer-overlay__close"
            aria-label="Close"
            data-testid="journal-composer-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="journal-composer-overlay__body">
          <ComposerEntityChips
            variant="inline"
            text={value}
            entities={matches}
            previewSpans={correction.visibleSpans}
            correctedRecords={correction.correctedRecords}
            confirmingSlots={confirmingSlots}
            includedSlots={includedSlots}
            onToggleIncluded={onToggleIncluded}
            onDismiss={onDismiss}
            onConfirm={onConfirm}
            onSelectPreviewSpan={(span) => correction.openSpan(span, 'composer')}
            onConfirmPreviewSpan={(span) => correction.confirmPreviewSpan(span)}
          />
          <EntityHighlightedComposer
            value={value}
            onChange={onChange}
            textareaRef={textareaRef}
            matches={matches}
            threadId={threadId}
            correction={correction}
            onPreviewCorrectionsChange={onPreviewCorrectionsChange}
            placeholder={placeholder}
            disabled={disabled || loading}
            onKeyDown={onKeyDown}
            className="journal-composer-overlay__field"
          />
        </div>

        <div className="journal-composer-overlay__footer">
          <div className="journal-composer-overlay__stats" aria-live="polite">
            <span>{stats.words} words</span>
            <span aria-hidden>·</span>
            <span>{stats.chars} chars</span>
            {stats.paragraphs > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{stats.paragraphs} {stats.paragraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || loading || disabled}
            className="journal-composer-overlay__send"
            aria-label="Send message"
            data-testid="journal-composer-send"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

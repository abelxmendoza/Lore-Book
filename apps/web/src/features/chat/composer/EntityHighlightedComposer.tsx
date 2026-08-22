import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Textarea } from '../../../components/ui/textarea';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import type { useEntityCorrectionState } from '../../../hooks/useEntityCorrectionState';
import { composerIntelligenceMetrics } from '../../../lib/composerIntelligence';
import { EntityClassificationPopover } from './EntityClassificationPopover';

type EntityCorrectionState = ReturnType<typeof useEntityCorrectionState>;

type EntityHighlightedComposerProps = {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  matches: CertifiedEntityMatch[];
  threadId?: string;
  // Both callers (ChatComposer, JournalComposerOverlay) always own and pass
  // their own useEntityCorrectionState instance — this must stay required.
  // It used to be optional with a hook-call fallback here, which meant a
  // second, fully independent debounced entity-correction pipeline (with its
  // own remote fetch) ran on every keystroke and was always discarded.
  correction: EntityCorrectionState;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPreviewCorrectionsChange?: (corrections: CorrectedPreviewSpan[]) => void;
};

/**
 * Grow height with content (single-line rest → multi-line as needed).
 * Skips the full-panel journal overlay field which fills its flex parent.
 */
function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el || el.classList.contains('journal-composer-overlay__field')) return;

  // Reset so scrollHeight reflects content, not a previous tall height.
  el.style.height = '0px';
  const styles = window.getComputedStyle(el);
  const minPx = parseFloat(styles.minHeight) || 0;
  const maxRaw = styles.maxHeight;
  const cssMaxPx =
    maxRaw && maxRaw !== 'none' && maxRaw !== '0px' ? parseFloat(maxRaw) : Number.POSITIVE_INFINITY;
  // The CSS cap uses dvh, which ignores the mobile on-screen keyboard. Cap
  // by the visual viewport too — minus room for the toolbar below — so the
  // Send button can never be pushed out of the reachable area.
  const vv = window.visualViewport;
  const visibleCap = vv ? Math.max(96, vv.height - 140) : Number.POSITIVE_INFINITY;
  const maxPx = Math.min(cssMaxPx, visibleCap);
  const content = el.scrollHeight;
  const next = Math.max(minPx, Number.isFinite(maxPx) ? Math.min(content, maxPx) : content);
  el.style.height = `${next}px`;
  el.style.overflowY = content > maxPx ? 'auto' : 'hidden';
}

/**
 * Composer field — plain textarea for reliable typing.
 * Entity / lexical preview UX lives in the chip strip above (not inline highlights).
 */
export const EntityHighlightedComposer = ({
  value,
  onChange,
  textareaRef,
  // matches/threadId are accepted for prop-shape compatibility with both
  // callers but are no longer read here directly — see `correction` above.
  correction,
  placeholder,
  disabled,
  className = '',
  style,
  onFocus,
  onBlur,
  onKeyDown,
  onPreviewCorrectionsChange,
}: EntityHighlightedComposerProps) => {
  const {
    activeCorrectedSpan,
    closeActiveSpan,
    applyAction,
    sendPayload,
    inferredAssociations,
  } = correction;

  useEffect(() => {
    onPreviewCorrectionsChange?.(sendPayload);
  }, [sendPayload, onPreviewCorrectionsChange]);

  // The textarea's own onChange handler already grows synchronously on user
  // keystrokes (it reads the DOM's already-updated scrollHeight before React
  // even re-renders). This effect exists for the OTHER case — `value`
  // changing programmatically (draft restore, clear-on-send, slash-command
  // insert, correction actions) — where onChange never fires. Skip the call
  // here when the keystroke path already grew for this exact value, so a
  // normal keystroke doesn't force a second synchronous layout reflow.
  const lastAutoGrownValueRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (lastAutoGrownValueRef.current === value) return;
    lastAutoGrownValueRef.current = value;
    autoGrowTextarea(textareaRef.current);
  }, [value, className, textareaRef]);

  useEffect(() => {
    const onResize = () => autoGrowTextarea(textareaRef.current);
    window.addEventListener('resize', onResize);
    // Keyboard open/close changes the visual viewport without a window resize.
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [textareaRef]);

  return (
    <div className="journal-composer-highlight-host" data-testid="entity-highlighted-composer">
      {activeCorrectedSpan && (
        <div className="composer-entity-popover z-[3]">
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
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          lastAutoGrownValueRef.current = e.target.value;
          onChange(e.target.value);
          composerIntelligenceMetrics.noteLayoutGrow();
          // Grow immediately on this frame (before paint if possible).
          // Mark this value so the layout effect does not grow a second time.
          autoGrowTextarea(e.currentTarget);
        }}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={className}
        style={style}
        spellCheck
      />
    </div>
  );
};

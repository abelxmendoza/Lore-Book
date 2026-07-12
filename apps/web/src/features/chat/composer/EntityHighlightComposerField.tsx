import { useLayoutEffect, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { Textarea } from '../../../components/ui/textarea';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

type EntityHighlightComposerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  matches: CertifiedEntityMatch[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  const styles = window.getComputedStyle(el);
  const minPx = parseFloat(styles.minHeight) || 0;
  const maxRaw = styles.maxHeight;
  const maxPx =
    maxRaw && maxRaw !== 'none' && maxRaw !== '0px' ? parseFloat(maxRaw) : Number.POSITIVE_INFINITY;
  const content = el.scrollHeight;
  const next = Math.max(minPx, Number.isFinite(maxPx) ? Math.min(content, maxPx) : content);
  el.style.height = `${next}px`;
  el.style.overflowY = content > maxPx ? 'auto' : 'hidden';
}

/** Plain composer textarea — chips handle entity surfacing (no transparent overlay). */
export const EntityHighlightComposerField = ({
  value,
  onChange,
  textareaRef,
  placeholder,
  disabled,
  className = '',
  style,
  onFocus,
  onBlur,
  onKeyDown,
}: EntityHighlightComposerFieldProps) => {
  useLayoutEffect(() => {
    autoGrow(textareaRef.current);
  }, [value, className, textareaRef]);

  return (
    <div className="relative min-w-0 flex-1" data-testid="composer-highlight-field">
      <Textarea
        ref={textareaRef}
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          autoGrow(e.currentTarget);
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

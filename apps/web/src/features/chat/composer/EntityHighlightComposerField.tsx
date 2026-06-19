import { useMemo, useRef, useCallback, type CSSProperties, type KeyboardEvent, type RefObject, type ReactNode } from 'react';
import { Textarea } from '../../../components/ui/textarea';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import {
  findEntityHighlightRanges,
  highlightClassForMatch,
} from '../../../lib/entityHighlightRanges';
import { visualKindForEntity } from '../../../lib/entityTypeColors';

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

function renderHighlightedSegments(text: string, matches: CertifiedEntityMatch[]) {
  const ranges = findEntityHighlightRanges(text, matches);
  if (ranges.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(
        <span key={`plain-${cursor}`} className="text-white/90">
          {text.slice(cursor, range.start)}
        </span>
      );
    }
    parts.push(
      <mark
        key={`hl-${range.start}-${range.end}-${range.match.id}`}
        data-testid={`composer-entity-highlight-${visualKindForEntity(range.match)}-${range.match.id}`}
        className={highlightClassForMatch(range.match)}
        title={`${range.match.name} — ${range.match.status === 'draft' ? 'new mention' : range.match.status === 'suggestion' ? 'pending in your books' : 'known in LoreBook'}`}
      >
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  }

  if (cursor < text.length) {
    parts.push(
      <span key={`plain-${cursor}`} className="text-white/90">
        {text.slice(cursor)}
      </span>
    );
  }

  return parts;
}

export const EntityHighlightComposerField = ({
  value,
  onChange,
  textareaRef,
  matches,
  placeholder,
  disabled,
  className = '',
  style,
  onFocus,
  onBlur,
  onKeyDown,
}: EntityHighlightComposerFieldProps) => {
  const backdropRef = useRef<HTMLDivElement>(null);

  const highlighted = useMemo(
    () => renderHighlightedSegments(value, matches),
    [value, matches]
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!textarea || !backdrop) return;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }, [textareaRef]);

  const showHighlights = matches.length > 0 && value.trim().length > 0;

  return (
    <div className="relative min-w-0 flex-1" data-testid="composer-highlight-field">
      {showHighlights && (
        <div
          ref={backdropRef}
          aria-hidden
          className={`composer-highlight-layer pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words ${className}`}
        >
          {highlighted}
          {'\n'}
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

import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
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
  return (
    <div className="relative min-w-0 flex-1" data-testid="composer-highlight-field">
      <Textarea
        ref={textareaRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

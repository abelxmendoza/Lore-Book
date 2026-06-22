import { useEffect, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { Textarea } from '../../../components/ui/textarea';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { useEntityCorrectionState } from '../../../hooks/useEntityCorrectionState';
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

/**
 * Composer field — plain textarea for reliable typing.
 * Entity / lexical preview UX lives in the chip strip above (not inline highlights).
 */
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
  const internalCorrection = useEntityCorrectionState(value, threadId, matches);
  const correction = correctionProp ?? internalCorrection;

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

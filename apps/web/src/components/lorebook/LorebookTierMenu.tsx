import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { LorebookForm, LorebookTierOffer } from '../../lib/lorebookTiers';
import { LorebookTierModal } from './LorebookTierModal';

type Props = {
  tierOffer: LorebookTierOffer;
  onSelectForm: (form: LorebookForm) => void;
  /** Allow opening when demo mode even if locked */
  forceEnable?: boolean;
  buttonLabel?: string;
  className?: string;
  testId?: string;
  /** Optional subject name shown in the modal */
  subjectLabel?: string;
};

/**
 * LoreBook control that opens an informative tier picker modal.
 */
export function LorebookTierMenu({
  tierOffer,
  onSelectForm,
  forceEnable = false,
  buttonLabel = 'LoreBook',
  className = '',
  testId = 'lorebook-tier-menu',
  subjectLabel,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative inline-flex ${className}`} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-amber-300/90 text-xs hover:text-amber-200 touch-manipulation"
        title={
          tierOffer.canCreateAny
            ? tierOffer.meter.detailLabel
            : 'See LoreBook forms and what’s needed to unlock them'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>{buttonLabel}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      <LorebookTierModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tierOffer={tierOffer}
        onSelectForm={onSelectForm}
        forceEnable={forceEnable}
        subjectLabel={subjectLabel}
        testId={`${testId}-modal`}
      />
    </div>
  );
}

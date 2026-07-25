import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Check,
  Feather,
  FileText,
  Lock,
  ScrollText,
  Sparkles,
  X,
} from 'lucide-react';
import { LorebookContentMeter } from './LorebookContentMeter';
import {
  LOREBOOK_TIER_ORDER,
  LOREBOOK_TIERS,
  type LorebookForm,
  type LorebookTierOffer,
} from '../../lib/lorebookTiers';
import './LorebookTierModal.css';

const TIER_ICONS: Record<LorebookForm, typeof Feather> = {
  vignette: Feather,
  chapter: FileText,
  short_book: ScrollText,
  book: BookOpen,
  epic: Sparkles,
};

const TIER_DETAILS: Record<LorebookForm, { blurb: string; output: string }> = {
  vignette: {
    blurb: 'A quick snapshot from a few moments.',
    output: '~300–600 words · one piece',
  },
  chapter: {
    blurb: 'One named chapter with a clear arc.',
    output: '1 chapter',
  },
  short_book: {
    blurb: 'Short-story length with a few chapters.',
    output: '2–4 chapters',
  },
  book: {
    blurb: 'Standard multi-chapter LoreBook.',
    output: 'Multiple chapters · detailed',
  },
  epic: {
    blurb: 'Long-form when you have deep coverage.',
    output: 'Long-form · epic depth',
  },
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tierOffer: LorebookTierOffer;
  onSelectForm: (form: LorebookForm) => void;
  forceEnable?: boolean;
  subjectLabel?: string;
  testId?: string;
};

/**
 * Progressive LoreBook form picker — amber archive theme, viewport-safe sheet.
 */
export function LorebookTierModal({
  isOpen,
  onClose,
  tierOffer,
  onSelectForm,
  forceEnable = false,
  subjectLabel,
  testId = 'lorebook-tier-modal',
}: Props) {
  const label = subjectLabel?.trim() || 'this subject';
  const highest = tierOffer.highestUnlocked;
  const next = tierOffer.next;

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSelect = (form: LorebookForm, unlocked: boolean) => {
    // forceEnable may allow compile when locked (timeline/demo); UI still shows Locked.
    if (!unlocked && !forceEnable) return;
    onSelectForm(form);
    onClose();
  };

  // Portal to body so parent modals (overflow/transform) don't clip the top.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lorebook-tier-modal-title"
      className="lorebook-tier-modal-backdrop"
      onClick={onClose}
      data-testid={testId}
    >
      <div
        className="lorebook-tier-modal-shell"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lorebook-tier-modal-glow" aria-hidden="true" />
        <div className="lorebook-tier-modal-accent" aria-hidden="true" />

        {/* Mobile grab affordance */}
        <div className="lorebook-tier-modal-handle sm:hidden" aria-hidden="true">
          <span />
        </div>

        <header className="lorebook-tier-modal-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="lorebook-tier-modal-mark shrink-0" aria-hidden="true">
                <BookOpen className="h-4 w-4 text-amber-100" />
              </div>
              <div className="min-w-0">
                <p className="lorebook-tier-modal-eyebrow">LoreBook forms</p>
                <h2 id="lorebook-tier-modal-title" className="lorebook-tier-modal-title">
                  Compile a LoreBook
                </h2>
                <p className="lorebook-tier-modal-subtitle">
                  About <span className="text-amber-200/95">“{label}”</span>
                  {highest
                    ? ' — choose how much story to weave.'
                    : ' — see what unlocks as you gather moments.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="lorebook-tier-modal-close"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="lorebook-tier-modal-progress">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-400/70">
                Content buildup
              </span>
              <LorebookContentMeter
                meter={{
                  progress: tierOffer.meter.progress,
                  counterLabel: tierOffer.meter.counterLabel,
                  detailLabel: tierOffer.meter.detailLabel,
                  ready: tierOffer.meter.ready,
                  currentForm: tierOffer.meter.currentForm,
                  nextForm: tierOffer.meter.nextForm,
                  segmentProgress: tierOffer.meter.segmentProgress,
                  tierOffer,
                }}
                size="comfortable"
              />
            </div>
            <p className="text-[11px] text-amber-100/55 leading-snug">
              {highest
                ? next
                  ? `Unlocked through ${LOREBOOK_TIERS[highest].label}. Next: ${LOREBOOK_TIERS[next].label}.`
                  : 'All forms unlocked — pick any length.'
                : next
                  ? `Nothing unlocked yet. Next: ${LOREBOOK_TIERS[next].label}.`
                  : 'Add a few moments to unlock your first form.'}
            </p>
          </div>
        </header>

        <div className="lorebook-tier-modal-list" role="list">
          {LOREBOOK_TIER_ORDER.map((form, index) => {
            const def = LOREBOOK_TIERS[form];
            const details = TIER_DETAILS[form];
            const status = tierOffer.tiers.find((t) => t.form === form);
            const unlocked = Boolean(status?.unlocked);
            const canCompile = unlocked || forceEnable;
            const Icon = TIER_ICONS[form];
            const isHighest = highest === form;
            const isNext = next === form;

            return (
              <div
                key={form}
                role="listitem"
                data-testid={`${testId}-card-${form}`}
                className={[
                  'lorebook-tier-card',
                  unlocked ? 'is-unlocked' : 'is-locked',
                  isHighest && unlocked ? 'is-best' : '',
                  isNext && !unlocked ? 'is-next' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="lorebook-tier-card-rail" aria-hidden="true">
                  <span className="lorebook-tier-card-dot" />
                  {index < LOREBOOK_TIER_ORDER.length - 1 && (
                    <span className="lorebook-tier-card-line" />
                  )}
                </div>

                <div className="lorebook-tier-card-icon" aria-hidden="true">
                  {unlocked ? <Icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                </div>

                <div className="lorebook-tier-card-body min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="lorebook-tier-card-name">{def.label}</h3>
                    {unlocked ? (
                      <span className="lorebook-tier-badge lorebook-tier-badge--ready">
                        <Check className="h-3 w-3" />
                        Unlocked
                      </span>
                    ) : (
                      <span className="lorebook-tier-badge lorebook-tier-badge--locked">
                        Locked
                      </span>
                    )}
                    {isHighest && unlocked && (
                      <span className="lorebook-tier-badge lorebook-tier-badge--best">Best</span>
                    )}
                    {isNext && !unlocked && (
                      <span className="lorebook-tier-badge lorebook-tier-badge--next">Next</span>
                    )}
                  </div>
                  <p className="lorebook-tier-card-blurb">{details.blurb}</p>
                  <p className="lorebook-tier-card-meta">{details.output}</p>
                  {!unlocked && status && (
                    <>
                      <p className="lorebook-tier-card-need">{status.detailLabel}</p>
                      <div className="lorebook-tier-card-bar" aria-hidden="true">
                        <div style={{ width: `${Math.round(status.progress * 100)}%` }} />
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canCompile}
                  onClick={() => handleSelect(form, Boolean(status?.unlocked))}
                  data-testid={`${testId}-select-${form}`}
                  className={
                    canCompile
                      ? 'lorebook-tier-compile'
                      : 'lorebook-tier-compile lorebook-tier-compile--disabled'
                  }
                >
                  {canCompile ? 'Compile' : 'Locked'}
                </button>
              </div>
            );
          })}
        </div>

        <footer className="lorebook-tier-modal-footer">
          <p>
            Grounded in your memories — LoreBook won’t invent biographical detail.
          </p>
          <button type="button" onClick={onClose} className="lorebook-tier-modal-dismiss">
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

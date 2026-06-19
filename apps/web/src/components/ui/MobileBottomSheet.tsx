import type { ReactNode } from 'react';
import { X } from 'lucide-react';

type MobileBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional action row pinned above safe area */
  footer?: ReactNode;
};

export const MobileBottomSheet = ({
  open,
  onClose,
  title,
  children,
  footer,
}: MobileBottomSheetProps) => {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] sm:hidden"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 sm:hidden flex flex-col rounded-t-2xl border-t border-white/12 bg-[#0c0c0c] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] max-h-[min(78dvh,640px)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex-shrink-0 flex items-center justify-center pt-2 pb-1">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>
        {(title || footer === undefined) && (
          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 pb-2">
            {title ? (
              <h3 className="text-base font-semibold text-white leading-snug pr-2">{title}</h3>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/50 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
        {footer && (
          <div
            className="flex-shrink-0 border-t border-white/8 px-4 py-3 bg-black/50"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
};

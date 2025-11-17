import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { IdentityPulsePanel } from './IdentityPulsePanel';

type IdentityPulseModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const IdentityPulseModal = ({ isOpen, onClose }: IdentityPulseModalProps) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-pulse-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-black/95 border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div>
            <h2 id="identity-pulse-modal-title" className="text-2xl font-semibold text-white">
              Identity Pulse
            </h2>
            <p className="text-sm text-white/60 mt-1">Active persona signature and identity metrics</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <IdentityPulsePanel />
        </div>
      </div>
    </div>
  );
};


import { X } from 'lucide-react';
import { Button } from './button';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full'
};

export const Modal = ({ isOpen, onClose, title, children, maxWidth = '2xl' }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`relative w-full h-full sm:h-auto ${maxWidth === 'full' ? 'max-w-full' : `sm:${maxWidthClasses[maxWidth]}`} sm:max-h-[90vh] ${maxWidth === 'lg' ? 'sm:max-h-[700px] sm:max-w-lg' : ''} ${maxWidth === 'xl' ? 'sm:max-h-[85vh] sm:max-w-2xl' : ''} ${maxWidth === '2xl' ? 'sm:max-h-[90vh] sm:max-w-4xl' : ''} ${maxWidth === 'md' ? 'sm:max-h-[500px] sm:max-w-md' : ''} bg-black/95 border-0 sm:border border-border/60 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border/50">
          <h2 id="modal-title" className="text-lg sm:text-2xl font-semibold text-white">
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
};


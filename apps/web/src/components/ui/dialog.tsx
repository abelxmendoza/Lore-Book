// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/cn';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

type DialogContentProps = {
  className?: string;
  children: React.ReactNode;
};

type DialogHeaderProps = {
  children: React.ReactNode;
};

type DialogTitleProps = {
  className?: string;
  children: React.ReactNode;
};

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  /**
   * A `click` fires on the nearest common ancestor of press and release, so a
   * press that starts on a control inside the panel and releases over the
   * backdrop (the panel re-laid out under the cursor — e.g. switching to a
   * shorter tab) targets this backdrop and used to dismiss the modal. Require
   * the press to start on the backdrop too.
   */
  const pressedBackdrop = useRef(false);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || !pressedBackdrop.current) return;
        onOpenChange(false);
      }}
    >
      {children}
    </div>
  );
};

export const DialogContent = ({ className, children, onClose }: DialogContentProps & { onClose?: () => void }) => {
  return (
    <div
      className={cn(
        "relative w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[90vh] bg-gradient-to-br from-black via-purple-950 to-black border-0 sm:border border-border/60 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
};

export const DialogHeader = ({ children }: DialogHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border/50">
      {children}
    </div>
  );
};

export const DialogTitle = ({ className, children }: DialogTitleProps) => {
  return (
    <h2 className={cn("text-lg sm:text-2xl font-semibold text-white", className)}>
      {children}
    </h2>
  );
};

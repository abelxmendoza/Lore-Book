// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

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
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => onOpenChange(false)}
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

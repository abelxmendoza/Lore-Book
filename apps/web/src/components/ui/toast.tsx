import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Briefcase } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Optional book-domain styling for suggestion-add toasts */
export type ToastTone = 'default' | 'project' | 'quest';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  tone?: ToastTone;
}

type ToastProps = Toast & {
  onClose: () => void;
};

const ToastComponent = ({ id, message, type, duration = 5000, tone = 'default', onClose }: ToastProps) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle
  };

  const styles = {
    success: 'bg-green-500/20 border-green-500/50 text-green-300',
    error: 'bg-red-500/20 border-red-500/50 text-red-300',
    info: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
    warning: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
  };

  const toneStyles: Record<ToastTone, string> = {
    default: 'animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-300 sm:slide-in-from-top-5',
    project:
      'bg-emerald-500/15 border-emerald-400/45 text-emerald-100 shadow-lg shadow-emerald-500/15 animate-in slide-in-from-bottom-6 fade-in zoom-in-95 duration-500 sm:slide-in-from-top-6',
    quest:
      'bg-amber-500/15 border-amber-400/45 text-amber-100 shadow-lg shadow-amber-500/15 animate-in slide-in-from-bottom-6 fade-in zoom-in-95 duration-500 sm:slide-in-from-top-6',
  };

  const toneIcons: Partial<Record<ToastTone, typeof CheckCircle2>> = {
    project: Briefcase,
    quest: CheckCircle2,
  };

  const Icon = (type === 'success' && toneIcons[tone]) ? toneIcons[tone]! : icons[type];
  const typeStyle = type === 'success' && tone !== 'default' ? '' : styles[type];

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 sm:items-center sm:gap-3 rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-sm w-full sm:max-w-sm',
        typeStyle,
        toneStyles[tone]
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-xs sm:text-sm font-medium leading-snug break-words">{message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded p-1 hover:bg-white/10 transition-colors"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

type ToastPlacement = 'default' | 'demo';

const PLACEMENT_CLASS: Record<ToastPlacement, string> = {
  // Mobile-first: bottom sheet style; desktop: top-right stack
  default:
    'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] flex flex-col gap-2 pointer-events-none sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:max-w-md',
  demo:
    'fixed inset-x-3 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] z-[90] flex flex-col gap-2 pointer-events-none sm:inset-x-auto sm:bottom-auto sm:top-[4.25rem] sm:right-3 sm:max-w-sm',
};

// Toast container component
export const ToastContainer = ({
  toasts,
  onRemove,
  placement = 'default',
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
  placement?: ToastPlacement;
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className={PLACEMENT_CLASS[placement]}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full sm:w-auto">
          <ToastComponent {...toast} onClose={() => onRemove(toast.id)} />
        </div>
      ))}
    </div>
  );
};

type UseToastOptions = {
  maxVisible?: number;
};

// Hook for managing toasts
export const useToast = (options: UseToastOptions = {}) => {
  const maxVisible = options.maxVisible ?? 2;
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (
    message: string,
    type: ToastType = 'info',
    duration?: number,
    tone: ToastTone = 'default'
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, message, type, duration, tone };
    setToasts((prev) => [...prev, newToast].slice(-maxVisible));
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = (message: string, duration?: number, tone?: ToastTone) =>
    showToast(message, 'success', duration, tone ?? 'default');
  const error = (message: string, duration?: number) => showToast(message, 'error', duration);
  const info = (message: string, duration?: number) => showToast(message, 'info', duration);
  const warning = (message: string, duration?: number) => showToast(message, 'warning', duration);

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    info,
    warning,
    ToastContainer: ({ placement = 'default' }: { placement?: ToastPlacement } = {}) => (
      <ToastContainer toasts={toasts} onRemove={removeToast} placement={placement} />
    ),
  };
};


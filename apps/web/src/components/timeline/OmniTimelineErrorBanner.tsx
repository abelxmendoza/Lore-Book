import { AlertCircle, RefreshCw } from 'lucide-react';

type Props = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function OmniTimelineErrorBanner({ message, onRetry, className = '' }: Props) {
  return (
    <div
      role="alert"
      data-testid="omni-timeline-error"
      className={`omni-timeline-error ${className}`.trim()}
    >
      <AlertCircle className="h-4 w-4 text-red-300 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="omni-timeline-error__text">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="omni-timeline-error__retry">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

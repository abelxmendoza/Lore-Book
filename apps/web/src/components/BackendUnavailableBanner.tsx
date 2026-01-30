import { AlertCircle } from 'lucide-react';
import { useMockData } from '../contexts/MockDataContext';

/**
 * Shows a single banner when the backend is unreachable and mock data was auto-enabled.
 * Reduces noise from repeated "Backend server is not running" errors.
 */
export function BackendUnavailableBanner() {
  const { backendUnavailable } = useMockData();
  if (!backendUnavailable) return null;

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500/95 text-amber-950 px-3 py-2 text-sm font-medium shadow-md"
      role="status"
      aria-live="polite"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Backend unavailable (retrying…)
      </span>
    </div>
  );
}

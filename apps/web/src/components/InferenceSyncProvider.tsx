import type { ReactNode } from 'react';
import { useInferenceSync } from '../hooks/useInferenceSync';

/** App-shell inference sync — runs once per session for authenticated users. */
export function InferenceSyncProvider({ children }: { children: ReactNode }) {
  useInferenceSync();
  return <>{children}</>;
}

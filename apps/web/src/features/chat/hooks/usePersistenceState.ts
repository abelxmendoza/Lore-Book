import { useSyncExternalStore } from 'react';
import {
  threadPersistenceTracker,
  type ThreadPersistenceRecord,
} from '../services/threadPersistenceTracker';

// Stable empty array for SSR/initial snapshot — never reassigned so Object.is stays true.
const EMPTY_SNAPSHOT: ThreadPersistenceRecord[] = [];

/** Subscribe to all tracked thread persistence records. Triggers on any change. */
export function usePersistenceSnapshot(): ThreadPersistenceRecord[] {
  return useSyncExternalStore(
    (cb) => threadPersistenceTracker.subscribe(cb),
    () => threadPersistenceTracker.snapshot(),
    () => EMPTY_SNAPSHOT
  );
}

/** Subscribe to a single thread's persistence record. */
export function useThreadPersistenceState(threadId: string | null | undefined): ThreadPersistenceRecord | null {
  return useSyncExternalStore(
    (cb) => threadPersistenceTracker.subscribe(cb),
    () => (threadId ? threadPersistenceTracker.get(threadId) : null),
    () => null
  );
}

/** Returns true once the backend comes back after being offline. */
export function useBackendAvailability(): boolean {
  return useSyncExternalStore(
    (cb) => threadPersistenceTracker.subscribe(cb),
    () => threadPersistenceTracker.backendAvailable,
    () => true
  );
}

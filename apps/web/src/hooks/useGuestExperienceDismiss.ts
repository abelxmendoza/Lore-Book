import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'lorekeeper.guestExperienceDismissed';

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyChange(): void {
  listeners.forEach((listener) => listener());
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** For tests — reset dismiss state between cases. */
export function resetGuestExperienceDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    /* storage unavailable */
  }
  notifyChange();
}

export function useGuestExperienceDismiss() {
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const sync = () => setDismissed(readDismissed());
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
    notifyChange();
  }, []);

  return { dismissed, dismiss };
}

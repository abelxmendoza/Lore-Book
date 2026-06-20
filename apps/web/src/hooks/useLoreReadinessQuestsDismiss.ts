import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'lorekeeper.loreReadinessQuestsDismissed';
const COLLAPSED_KEY = 'lorekeeper.loreReadinessQuestsCollapsed';

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyPanelChange(): void {
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

function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) sessionStorage.setItem(COLLAPSED_KEY, '1');
    else sessionStorage.removeItem(COLLAPSED_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** For tests — reset panel state between cases. */
export function resetLoreReadinessQuestsDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
    sessionStorage.removeItem(COLLAPSED_KEY);
  } catch {
    /* storage unavailable */
  }
  notifyPanelChange();
}

export function useLoreReadinessQuestsDismiss() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    const sync = () => {
      setDismissed(readDismissed());
      setCollapsed(readCollapsed());
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
    notifyPanelChange();
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = !readCollapsed();
    writeCollapsed(next);
    setCollapsed(next);
    notifyPanelChange();
  }, []);

  return { dismissed, dismiss, collapsed, toggleCollapsed };
}

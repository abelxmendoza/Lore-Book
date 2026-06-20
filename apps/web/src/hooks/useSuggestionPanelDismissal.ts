import { useCallback, useEffect, useState } from 'react';

export type SuggestionPanelDomain =
  | 'skills'
  | 'quests'
  | 'characters'
  | 'characters-romantic'
  | 'locations'
  | 'projects'
  | 'groups';

function storageKey(domain: SuggestionPanelDomain): string {
  return `lk:suggestion-panel-dismissed:${domain}`;
}

function readDismissed(domain: SuggestionPanelDomain): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(storageKey(domain)) === '1';
}

type Options = {
  loading?: boolean;
  scanning?: boolean;
};

/**
 * Hides an empty suggestion panel after the user dismisses it.
 * Reopens when new suggestions arrive or when `reopenPanel` is called (e.g. rescan).
 */
export function useSuggestionPanelDismissal(
  domain: SuggestionPanelDomain,
  visibleCount: number,
  { loading = false, scanning = false }: Options = {},
) {
  const key = storageKey(domain);
  const [dismissedEmpty, setDismissedEmpty] = useState(() => readDismissed(domain));

  useEffect(() => {
    if (visibleCount > 0) {
      setDismissedEmpty(false);
      sessionStorage.removeItem(key);
    }
  }, [visibleCount, key]);

  const dismissEmptyPanel = useCallback(() => {
    setDismissedEmpty(true);
    sessionStorage.setItem(key, '1');
  }, [key]);

  const reopenPanel = useCallback(() => {
    setDismissedEmpty(false);
    sessionStorage.removeItem(key);
  }, [key]);

  const isEmpty = visibleCount === 0 && !loading && !scanning;
  const hidePanel = dismissedEmpty && isEmpty;

  return { hidePanel, dismissEmptyPanel, reopenPanel, isEmpty };
}

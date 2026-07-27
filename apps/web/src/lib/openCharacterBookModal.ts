/**
 * Navigate to Character Book and open a character detail modal on a specific tab.
 * CharacterBook reads `highlightItem` + `characterModalTab` (+ optional focus field)
 * from sessionStorage.
 */

export type CharacterBookModalTab =
  | 'info'
  | 'knowledge'
  | 'chat'
  | 'relationships'
  | 'timeline'
  /** @deprecated Prefer `timeline` (Story tab). Kept for deep-link compatibility. */
  | 'history'
  /** @deprecated Prefer `relationships` — Connections tab now includes wider network. */
  | 'network'
  | 'insights'
  | 'perceptions'
  | 'evidence'
  | 'photos'
  | 'messages'
  | 'social'
  | 'metadata';

export type CharacterBookModalFocusField = 'role';

export type OpenCharacterBookModalOptions = {
  characterId: string;
  tab?: CharacterBookModalTab;
  /** Scroll/highlight a specific field after the modal opens (Info tab). */
  focusField?: CharacterBookModalFocusField;
};

export function openCharacterBookModal({
  characterId,
  tab,
  focusField,
}: OpenCharacterBookModalOptions): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', characterId);
  if (tab) {
    const resolvedTab = tab === 'history' ? 'timeline' : tab === 'network' ? 'relationships' : tab;
    sessionStorage.setItem('characterModalTab', resolvedTab);
  } else if (focusField) {
    sessionStorage.setItem('characterModalTab', 'info');
  } else {
    sessionStorage.removeItem('characterModalTab');
  }
  if (focusField) {
    sessionStorage.setItem('characterModalFocusField', focusField);
  } else {
    sessionStorage.removeItem('characterModalFocusField');
  }
  window.dispatchEvent(
    new CustomEvent('navigate-surface', {
      detail: { surface: 'characters' as const },
    })
  );
}

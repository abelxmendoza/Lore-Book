/**
 * Navigate to Character Book and open a character detail modal on a specific tab.
 * CharacterBook reads `highlightItem` + `characterModalTab` from sessionStorage.
 */

export type CharacterBookModalTab =
  | 'info'
  | 'knowledge'
  | 'chat'
  | 'relationships'
  | 'timeline'
  | 'history'
  | 'network'
  | 'insights'
  | 'perceptions'
  | 'evidence'
  | 'photos'
  | 'messages'
  | 'social'
  | 'metadata';

export type OpenCharacterBookModalOptions = {
  characterId: string;
  tab?: CharacterBookModalTab;
};

export function openCharacterBookModal({ characterId, tab }: OpenCharacterBookModalOptions): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', characterId);
  if (tab) {
    sessionStorage.setItem('characterModalTab', tab);
  } else {
    sessionStorage.removeItem('characterModalTab');
  }
  window.dispatchEvent(
    new CustomEvent('navigate-surface', {
      detail: { surface: 'characters' as const },
    })
  );
}

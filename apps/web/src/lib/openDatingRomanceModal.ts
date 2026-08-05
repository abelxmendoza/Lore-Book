/**
 * Navigate to Dating & Romance and open a relationship detail modal on a specific tab.
 * LoveAndRelationshipsView reads `highlightRelationship` / `highlightRelationshipCharacterId`
 * + optional `relationshipModalTab` from sessionStorage.
 */

export type DatingRomanceModalTab =
  | 'overview'
  | 'chat'
  | 'kids'
  | 'timeline'
  | 'pros-cons'
  | 'analytics'
  | 'their-connections'
  | 'life-impact';

export type OpenDatingRomanceModalOptions = {
  /** Prefer when known — opens this relationship directly. */
  relationshipId?: string;
  /** Fallback resolver: find relationship linked to this Character Book id. */
  characterId?: string;
  tab?: DatingRomanceModalTab;
};

export function openDatingRomanceModal({
  relationshipId,
  characterId,
  tab,
}: OpenDatingRomanceModalOptions): void {
  if (typeof window === 'undefined') return;
  if (!relationshipId && !characterId) return;

  if (relationshipId) {
    sessionStorage.setItem('highlightRelationship', relationshipId);
  } else {
    sessionStorage.removeItem('highlightRelationship');
  }

  if (characterId) {
    sessionStorage.setItem('highlightRelationshipCharacterId', characterId);
  } else {
    sessionStorage.removeItem('highlightRelationshipCharacterId');
  }

  if (tab) {
    sessionStorage.setItem('relationshipModalTab', tab);
  } else {
    sessionStorage.removeItem('relationshipModalTab');
  }

  window.dispatchEvent(
    new CustomEvent('navigate-surface', {
      detail: { surface: 'love' as const },
    }),
  );
}

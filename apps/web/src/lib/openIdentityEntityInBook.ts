/**
 * Navigate from Identity Center (entity resolution) into the authoritative story book.
 * CHARACTER/PERSON → Characters; LOCATION → Places; ORG → Groups.
 */

import type { EntityType } from '../api/entityResolution';
import {
  openCharacterBookModal,
  openLocationBookModal,
  openOrganizationBookModal,
} from './skillEntityNavigation';

export type IdentityBookTarget = {
  surface: 'characters' | 'locations' | 'organizations';
  label: string;
};

export function identityBookTargetForType(type: EntityType): IdentityBookTarget | null {
  switch (type) {
    case 'CHARACTER':
    case 'PERSON':
      return { surface: 'characters', label: 'Character Book' };
    case 'LOCATION':
      return { surface: 'locations', label: 'Places' };
    case 'ORG':
      return { surface: 'organizations', label: 'Groups & Organizations' };
    default:
      return null;
  }
}

/**
 * Open the typed book for a resolved entity id.
 * Returns false when the type has no book (concepts / generic ENTITY).
 */
export function openIdentityEntityInBook(entityId: string, type: EntityType): boolean {
  const target = identityBookTargetForType(type);
  if (!target) return false;

  if (target.surface === 'characters') {
    openCharacterBookModal({ characterId: entityId });
    return true;
  }
  if (target.surface === 'locations') {
    openLocationBookModal(entityId);
    return true;
  }
  openOrganizationBookModal(entityId);
  return true;
}

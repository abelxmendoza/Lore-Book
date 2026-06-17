/** @deprecated Import from relationshipPeripheralService */
export {
  type RelationshipPeripheral,
  type RelationshipPeripheralTier,
  type RomanticPeripheral,
  type RomanticPeripheralTier,
  listPeripheralsForCharacter,
  listPeripheralsForRelationship,
  ingestRelationshipPeripheralsFromMessage,
  ingestVicariousFromMessage,
  applyVicariousRelationshipHit,
  applyVicariousHit,
  confirmPeripheral,
  dismissPeripheral,
  promotePeripheralToCharacter,
} from './relationshipPeripheralService';

export type RomanticPeripheralTier = import('./relationshipPeripheralService').RelationshipPeripheralTier;

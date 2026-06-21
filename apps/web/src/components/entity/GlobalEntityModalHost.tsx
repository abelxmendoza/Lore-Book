import { useEntityModal } from '../../contexts/EntityModalContext';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { LocationDetailModal } from '../locations/LocationDetailModal';
import { EntityDetailModal } from './EntityDetailModal';

/**
 * Renders the global entity detail modal driven by Redux selection state.
 * Mount once near the app root so openCharacter / openLocation / openMemory work everywhere.
 *
 * Routes each known entity type to its RICH typed modal — the one place that
 * concentrates the full info + knowledge base (facts, evidence, relationships) —
 * so an entity clicked anywhere in the app opens the same canonical home it has in
 * its Book. The already-fetched record on selectedEntity (openCharacter/openLocation
 * load the full row up front) is reused, so this adds no extra network round-trip.
 * Falls back to the generic modal for memories and any untyped/unhydrated entity.
 */
export function GlobalEntityModalHost() {
  const { selectedEntity, isOpen, closeEntity } = useEntityModal();

  if (!isOpen || !selectedEntity) return null;

  if (selectedEntity.type === 'character' && selectedEntity.character) {
    return (
      <CharacterDetailModal
        character={selectedEntity.character}
        onClose={closeEntity}
        onUpdate={() => {}}
      />
    );
  }

  if (selectedEntity.type === 'location' && selectedEntity.location) {
    return <LocationDetailModal location={selectedEntity.location} onClose={closeEntity} />;
  }

  return <EntityDetailModal entity={selectedEntity} onClose={closeEntity} />;
}

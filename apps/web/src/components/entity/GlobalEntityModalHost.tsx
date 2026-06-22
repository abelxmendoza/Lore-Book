import { useEntityModal } from '../../contexts/EntityModalContext';
import { locationStub } from '../../lib/hydrateBookEntity';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { LocationDetailModal } from '../locations/LocationDetailModal';
import { EntityDetailModal } from './EntityDetailModal';

/**
 * Renders the global entity detail modal driven by Redux selection state.
 * Mount once near the app root so openCharacter / openLocation / openMemory work everywhere.
 *
 * Routes each known entity type to its rich typed modal. Seed data opens immediately;
 * CharacterDetailModal / LocationDetailModal / EntityModalContext hydrate the full row.
 */
export function GlobalEntityModalHost() {
  const { selectedEntity, isOpen, closeEntity } = useEntityModal();

  if (!isOpen || !selectedEntity) return null;

  if (selectedEntity.type === 'character' && selectedEntity.id) {
    const character =
      selectedEntity.character ??
      ({ id: selectedEntity.id, name: selectedEntity.name ?? 'Character' } as const);
    return (
      <CharacterDetailModal
        character={character}
        onClose={closeEntity}
        onUpdate={() => {}}
      />
    );
  }

  if (selectedEntity.type === 'location' && selectedEntity.id) {
    const location =
      selectedEntity.location ?? locationStub(selectedEntity.id, selectedEntity.name);
    return <LocationDetailModal location={location} onClose={closeEntity} />;
  }

  return <EntityDetailModal entity={selectedEntity} onClose={closeEntity} />;
}

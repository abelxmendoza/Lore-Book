import { useEntityModal } from '../../contexts/EntityModalContext';
import { EntityDetailModal } from './EntityDetailModal';

/**
 * Renders the global entity detail modal driven by Redux selection state.
 * Mount once near the app root so openCharacter / openLocation / openMemory work everywhere.
 */
export function GlobalEntityModalHost() {
  const { selectedEntity, isOpen, closeEntity } = useEntityModal();

  if (!isOpen || !selectedEntity) return null;

  return <EntityDetailModal entity={selectedEntity} onClose={closeEntity} />;
}

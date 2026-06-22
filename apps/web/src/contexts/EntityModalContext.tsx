import { useCallback, type ReactNode } from 'react';
import type { EntityData } from '../components/entity/EntityDetailModal';
import { openEntityModal } from '../lib/openEntityModal';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  openEntity as openEntityAction,
  updateSelectedEntity,
  closeEntityModal,
  clearSelectedEntity,
} from '../store/slices/selectionSlice';

interface EntityModalContextType {
  selectedEntity: EntityData | null;
  isOpen: boolean;
  openEntity: (entity: EntityData) => void;
  closeEntity: () => void;
  openMemory: (memory: any) => void;
  openCharacter: (character: any) => void;
  openLocation: (location: any) => void;
  updateEntity: (entity: EntityData) => void;
}

/** Passthrough — entity-modal state now lives in the Redux `selection` slice. */
export const EntityModalProvider = ({ children }: { children: ReactNode }) => <>{children}</>;

export const useEntityModal = (): EntityModalContextType => {
  const dispatch = useAppDispatch();
  const selectedEntity = useAppSelector((s) => s.selection.selectedEntity);
  const isOpen = useAppSelector((s) => s.selection.entityModalOpen);

  const openEntity = useCallback(
    (entity: EntityData) => dispatch(openEntityAction(entity)),
    [dispatch]
  );

  const updateEntity = useCallback(
    (entity: EntityData) => dispatch(updateSelectedEntity(entity)),
    [dispatch]
  );

  const closeEntity = useCallback(() => {
    dispatch(closeEntityModal());
    // Keep the entity around briefly so the close animation can run.
    setTimeout(() => dispatch(clearSelectedEntity()), 300);
  }, [dispatch]);

  const openMemory = useCallback(
    (memory: any) => {
      openEntityModal(dispatch, {
        type: 'memory',
        id: memory.id || memory.journal_entry_id,
        name: memory.content?.substring(0, 50) || 'Memory',
        seed: memory,
      });
    },
    [dispatch]
  );

  const openCharacter = useCallback(
    (character: any) => {
      const seed = character.character ?? character;
      const id = seed?.id ?? character.id;
      if (!id) return;

      openEntityModal(dispatch, {
        type: 'character',
        id: String(id),
        name: seed?.name ?? character.name,
        seed: { ...seed, description: character.description, tags: character.tags },
      });
    },
    [dispatch]
  );

  const openLocation = useCallback(
    (location: any) => {
      const seed = location.location ?? location;
      const id = seed?.id ?? location.id;
      if (!id) return;

      openEntityModal(dispatch, {
        type: 'location',
        id: String(id),
        name: seed?.name ?? location.name,
        seed: { ...seed, description: location.description, tags: location.tags },
      });
    },
    [dispatch]
  );

  return {
    selectedEntity,
    isOpen,
    openEntity,
    closeEntity,
    openMemory,
    openCharacter,
    openLocation,
    updateEntity,
  };
};

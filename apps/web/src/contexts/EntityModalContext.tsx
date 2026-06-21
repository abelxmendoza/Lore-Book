import { useCallback, type ReactNode } from 'react';
import type { EntityData } from '../components/entity/EntityDetailModal';
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
      openEntity({
        type: 'memory',
        id: memory.id || memory.journal_entry_id,
        memory,
        content: memory.content,
        date: memory.start_time || memory.date,
        title: memory.content?.substring(0, 50) || 'Memory',
      });
    },
    [openEntity]
  );

  const openCharacter = useCallback(
    async (character: any) => {
      const seed = character.character || character;
      openEntity({
        type: 'character',
        id: character.id,
        name: character.name || seed?.name,
        character: seed,
        description: character.description || seed?.summary,
        tags: character.tags || seed?.tags,
      });
      if (!character.character && character.id && !String(character.id).startsWith('dummy-')) {
        try {
          const { cachedFetchJson } = await import('../lib/requestCache');
          const fullCharacter = await cachedFetchJson<any>(`/api/characters/${character.id}`);
          updateEntity({
            type: 'character',
            id: character.id,
            name: fullCharacter.name || character.name,
            character: fullCharacter,
            description: fullCharacter.summary ?? character.description,
            tags: fullCharacter.tags ?? character.tags,
          });
        } catch (error) {
          console.error('Error loading character:', error);
          // Keep modal open with seed data — never clear on transient fetch failure.
        }
      }
    },
    [openEntity, updateEntity]
  );

  const openLocation = useCallback(
    async (location: any) => {
      const seed = location.location || location;
      openEntity({
        type: 'location',
        id: location.id,
        name: location.name || seed?.name,
        location: seed,
        description: location.description || seed?.description,
        tags: location.tags || seed?.tags,
      });
      if (!location.location && location.id) {
        try {
          const { cachedFetchJson } = await import('../lib/requestCache');
          const fullLocation = await cachedFetchJson<any>(`/api/locations/${location.id}`);
          updateEntity({
            type: 'location',
            id: location.id,
            name: fullLocation.name || location.name,
            location: fullLocation,
            description: fullLocation.description ?? location.description,
            tags: fullLocation.tags ?? location.tags,
          });
        } catch (error) {
          console.error('Error loading location:', error);
        }
      }
    },
    [openEntity, updateEntity]
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

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { EntityData } from '../components/entity/EntityDetailModal';

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

const EntityModalContext = createContext<EntityModalContextType | undefined>(undefined);

export const EntityModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openEntity = useCallback((entity: EntityData) => {
    setSelectedEntity(entity);
    setIsOpen(true);
  }, []);

  const closeEntity = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setSelectedEntity(null), 300);
  }, []);

  const updateEntity = useCallback((entity: EntityData) => {
    setSelectedEntity(prev => (prev ? { ...prev, ...entity } : entity));
  }, []);

  const openMemory = useCallback((memory: any) => {
    openEntity({
      type: 'memory',
      id: memory.id || memory.journal_entry_id,
      memory: memory,
      content: memory.content,
      date: memory.start_time || memory.date,
      title: memory.content?.substring(0, 50) || 'Memory'
    });
  }, [openEntity]);

  const openCharacter = useCallback(async (character: any) => {
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
        const { fetchJson } = await import('../lib/api');
        const fullCharacter = await fetchJson(`/api/characters/${character.id}`);
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
  }, [openEntity, updateEntity]);

  const openLocation = useCallback(async (location: any) => {
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
        const { fetchJson } = await import('../lib/api');
        const fullLocation = await fetchJson(`/api/locations/${location.id}`);
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
  }, [openEntity, updateEntity]);

  return (
    <EntityModalContext.Provider
      value={{
        selectedEntity,
        isOpen,
        openEntity,
        closeEntity,
        openMemory,
        openCharacter,
        openLocation,
        updateEntity
      }}
    >
      {children}
    </EntityModalContext.Provider>
  );
};

export const useEntityModal = () => {
  const context = useContext(EntityModalContext);
  if (!context) {
    throw new Error('useEntityModal must be used within EntityModalProvider');
  }
  return context;
};

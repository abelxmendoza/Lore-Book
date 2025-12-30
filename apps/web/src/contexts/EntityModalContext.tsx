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
    // If only id/name provided, fetch full character
    if (!character.character && character.id) {
      try {
        const { fetchJson } = await import('../lib/api');
        const fullCharacter = await fetchJson(`/api/characters/${character.id}`);
        character = { ...character, character: fullCharacter };
      } catch (error) {
        console.error('Error loading character:', error);
      }
    }
    openEntity({
      type: 'character',
      id: character.id,
      name: character.name || character.character?.name,
      character: character.character || character,
      description: character.description || character.character?.summary,
      tags: character.tags || character.character?.tags
    });
  }, [openEntity]);

  const openLocation = useCallback(async (location: any) => {
    // If only id/name provided, fetch full location
    if (!location.location && location.id) {
      try {
        const { fetchJson } = await import('../lib/api');
        const fullLocation = await fetchJson(`/api/locations/${location.id}`);
        location = { ...location, location: fullLocation };
      } catch (error) {
        console.error('Error loading location:', error);
      }
    }
    openEntity({
      type: 'location',
      id: location.id,
      name: location.name || location.location?.name,
      location: location.location || location,
      description: location.description || location.location?.description,
      tags: location.tags || location.location?.tags
    });
  }, [openEntity]);

  const updateEntity = useCallback((entity: EntityData) => {
    setSelectedEntity(prev => prev ? { ...prev, ...entity } : entity);
  }, []);

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

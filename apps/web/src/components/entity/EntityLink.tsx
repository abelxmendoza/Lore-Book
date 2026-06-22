import React from 'react';
import { useEntityModal } from '../../contexts/EntityModalContext';
import type { EntityType } from './EntityDetailModal';

interface EntityLinkProps {
  type: EntityType;
  id: string;
  name: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Clickable link component that opens EntityDetailModal
 * Use this throughout the app for consistent entity linking
 */
export const EntityLink: React.FC<EntityLinkProps> = ({
  type,
  id,
  name,
  className = 'text-primary hover:text-primary/80 underline cursor-pointer',
  children
}) => {
  const { openEntity, openCharacter, openLocation, openMemory } = useEntityModal();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (type === 'character') {
      void openCharacter({ id, name });
      return;
    }
    if (type === 'location') {
      void openLocation({ id, name });
      return;
    }
    if (type === 'memory') {
      openMemory({ id, content: name, journal_entry_id: id });
      return;
    }

    openEntity({ type, id, name });
  };

  return (
    <span
      onClick={handleClick}
      className={className}
      title={`Click to view ${name}`}
    >
      {children || name}
    </span>
  );
};

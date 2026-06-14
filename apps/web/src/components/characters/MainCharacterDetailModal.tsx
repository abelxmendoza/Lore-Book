import { CharacterDetailModal } from './CharacterDetailModal';
import type { Character } from './CharacterProfileCard';

type Props = {
  character: Character;
  onClose: () => void;
  onUpdate?: () => void;
};

/**
 * Full-screen modal for the user's main character (protagonist).
 */
export const MainCharacterDetailModal = ({ character, onClose, onUpdate }: Props) => {
  return (
    <CharacterDetailModal
      character={character}
      isMainCharacter
      onClose={onClose}
      onUpdate={onUpdate ?? onClose}
    />
  );
};

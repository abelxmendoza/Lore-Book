import type { FC } from 'react';

import type { useCharacterIndexer } from '../../hooks/useCharacterIndexer';

export const CharacterLinker: FC<{ indexer: ReturnType<typeof useCharacterIndexer> }> = ({ indexer }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Character Linking</span>
        <span className="text-white/40">auto-detected</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {indexer.matches.map((character) => (
          <button
            key={character.name}
            onClick={() => indexer.toggleLink(character.name)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
              character.linked
                ? 'border-neon-purple/60 bg-neon-purple/10 text-neon-aqua'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-neon-pink/50 hover:text-white'
            }`}
          >
            {character.portraitUrl && (
              <span
                className="h-6 w-6 rounded-full bg-cover bg-center"
                style={{ backgroundImage: `url(${character.portraitUrl})` }}
              />
            )}
            <span>{character.name}</span>
            <span className="text-[10px] text-white/40">{Math.round(character.confidence * 100)}%</span>
          </button>
        ))}
        {indexer.matches.length === 0 && <span className="text-sm text-white/40">No characters detected yet.</span>}
      </div>
    </div>
  );
};

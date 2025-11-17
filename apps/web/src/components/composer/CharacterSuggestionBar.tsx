const characters = ['Mira', 'Ash', 'Kade', 'Nova'];

export const CharacterSuggestionBar = () => (
  <div className="flex flex-wrap gap-2 text-xs text-white/70">
    <span className="text-white/50">Characters:</span>
    {characters.map((character) => (
      <span key={character} className="rounded border border-secondary/40 px-3 py-1">
        {character}
      </span>
    ))}
  </div>
);

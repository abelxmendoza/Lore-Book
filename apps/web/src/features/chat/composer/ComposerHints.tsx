type Mood = {
  score: number;
  color: string;
  label: string;
};

type ComposerHintsProps = {
  mood: Mood;
  characterCount: number;
  tagCount: number;
};

export const ComposerHints = ({ mood, characterCount, tagCount }: ComposerHintsProps) => {
  return (
    <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-3 text-xs">
      {mood.score !== 0 && (
        <div className="flex items-center gap-2 text-white/60">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: mood.color }}
          />
          <span>{mood.label}</span>
        </div>
      )}
      {characterCount > 0 && (
        <div className="flex items-center gap-1 text-white/60">
          <span>{characterCount} character{characterCount > 1 ? 's' : ''} mentioned</span>
        </div>
      )}
      {tagCount > 0 && (
        <div className="flex items-center gap-1 text-white/60">
          <span>{tagCount} tag{tagCount > 1 ? 's' : ''} suggested</span>
        </div>
      )}
    </div>
  );
};


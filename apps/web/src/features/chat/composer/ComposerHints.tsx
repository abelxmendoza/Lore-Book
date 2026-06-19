type Mood = {
  score: number;
  color: string;
  label: string;
};

type ComposerHintsProps = {
  mood: Mood;
  tagCount: number;
};

/** Minimal mood / tag hint — entity chips live in ComposerEntityChips only. */
export const ComposerHints = ({ mood, tagCount }: ComposerHintsProps) => {
  if (mood.score === 0 && tagCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-0.5 text-[10px] text-white/35 sm:px-4 lg:px-10 xl:px-12">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
        {mood.score !== 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: mood.color }} />
            {mood.label}
          </span>
        )}
        {tagCount > 0 && (
          <span>
            {tagCount} tag{tagCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
};

import type { FC } from 'react';

import { moodScales } from '../../utils/moodScales';
import type { useMoodEngine } from '../../hooks/useMoodEngine';

export const MoodBar: FC<{ moodEngine: ReturnType<typeof useMoodEngine> }> = ({ moodEngine }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Mood Bar</span>
        <span className="text-white/40">cyber sentiment</span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 transition-all duration-500"
          style={{ width: `${((moodEngine.mood.score + 5) / 10) * 100}%`, background: moodEngine.mood.color }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{moodEngine.mood.label}</span>
        <span className="text-white/40">{moodEngine.mood.score}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-white/40">
        {moodScales.map((scale) => (
          <button
            key={scale.score}
            onClick={() => moodEngine.setScore(scale.score)}
            className={`rounded-full border px-3 py-1 transition ${
              moodEngine.mood.score === scale.score
                ? 'border-neon-blue/70 bg-neon-blue/10 text-white'
                : 'border-white/10 bg-white/5 hover:border-neon-pink/50 hover:text-white'
            }`}
          >
            {scale.label}
          </button>
        ))}
      </div>
    </div>
  );
};

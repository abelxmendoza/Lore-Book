import type { Dispatch, SetStateAction } from 'react';

import { cn } from '../../lib/utils';

type Props = {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  moodColor: string;
  moodScore: number;
  saving: boolean;
  lastSavedAt: string | null;
  onSubmit: () => Promise<void> | void;
};

export const NotebookComposer = ({ value, onChange, moodColor, moodScore, saving, lastSavedAt, onSubmit }: Props) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/50">Neon Notebook</p>
          <h2 className="glitch-text text-2xl font-semibold" data-text="Memory Capture">
            Memory Capture
          </h2>
        </div>
        <div className="text-xs text-white/60">
          {saving ? 'Stabilizing signal...' : lastSavedAt ? `Autosaved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Drafting...'}
        </div>
      </div>
      <div
        className={cn(
          'relative rounded-xl border bg-black/60 p-4 text-white shadow-lg transition-all duration-300',
          'focus-within:border-neon-pink/80',
          'neon-glow'
        )}
        style={{ borderColor: `${moodColor}99`, boxShadow: `0 0 30px ${moodColor}40` }}
      >
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-48 w-full resize-none bg-transparent text-lg outline-none placeholder:text-white/30"
          placeholder="Stream your memory. Autotagging, character linking, and mood detection react as you type..."
        />
        <div className="pointer-events-none absolute inset-0 animate-pulse opacity-10" style={{ color: moodColor }} />
      </div>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Glow intensity: {moodScore}</span>
        <button
          className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-neon-aqua/60 hover:text-neon-aqua"
          onClick={onSubmit}
          disabled={saving}
        >
          {saving ? 'Syncing...' : 'Archive Entry'}
        </button>
      </div>
    </div>
  );
};

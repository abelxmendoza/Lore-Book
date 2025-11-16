import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import type { Chapter } from '../hooks/useLoreKeeper';

import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

export type JournalComposerProps = {
  onSave: (content: string, options?: { chapterId?: string | null }) => Promise<void>;
  onAsk: (content: string) => Promise<void>;
  loading?: boolean;
  chapters?: Chapter[];
};

export const JournalComposer = ({ onSave, onAsk, loading, chapters = [] }: JournalComposerProps) => {
  const [value, setValue] = useState('');
  const [chapterId, setChapterId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value.trim()) return;
    await onSave(value.trim(), { chapterId });
    setValue('');
    setChapterId(null);
  };

  const handleAsk = async () => {
    if (!value.trim()) return;
    await onAsk(value.trim());
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-black/40 p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-techno text-sm uppercase tracking-[0.5em] text-white/60">New Memory</h3>
        <span className="text-xs text-white/40">Auto-save keywords: log, update, chapter…</span>
      </div>
      <Textarea
        placeholder="Log your mission, feelings, or milestones…"
        className="mt-4"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
        <label className="font-semibold uppercase tracking-[0.3em] text-white/40">Chapter</label>
        <select
          className="rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
          value={chapterId ?? ''}
          onChange={(event) => setChapterId(event.target.value || null)}
        >
          <option value="">Unassigned</option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={!value.trim()}>
          Save to Lore
        </Button>
        <Button variant="ghost" onClick={handleAsk} disabled={!value.trim() || loading} leftIcon={<Sparkles className="h-4 w-4 text-primary" />}>
          Ask Lore Keeper
        </Button>
      </div>
    </div>
  );
};

import { BookOpen, Flame, ChevronDown } from 'lucide-react';

import type { TimelineGroup, TimelineResponse } from '../hooks/useLoreKeeper';
import { Button } from './ui/button';

const ChapterIcon = () => (
  <div className="relative h-8 w-8 rounded-full bg-primary/10">
    <BookOpen className="absolute left-1 top-1 h-6 w-6 text-primary" />
    <Flame className="absolute -right-1 -top-2 h-4 w-4 text-amber-300 flicker" />
  </div>
);

const EntryPreview = ({ months }: { months: TimelineGroup[] }) => (
  <div className="space-y-3 text-sm text-white/80">
    {months.map((month) => (
      <div key={month.month}>
        <p className="text-xs uppercase text-white/50">{month.month}</p>
        <ul className="mt-1 space-y-1">
          {month.entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="truncate border-l-2 border-primary/60 pl-2">
              {entry.summary ?? entry.content}
            </li>
          ))}
        </ul>
      </div>
    ))}
    {months.length === 0 && <p className="text-white/40">No entries yet.</p>}
  </div>
);

type ChaptersListProps = {
  timeline: TimelineResponse;
  onCreateClick: () => void;
  onSummarize?: (chapterId: string) => void;
};

export const ChaptersList = ({ timeline, onCreateClick, onSummarize }: ChaptersListProps) => {
  return (
    <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-white/50">Chapters</p>
          <h3 className="text-lg font-semibold text-white">Lore Arcs</h3>
        </div>
        <Button size="sm" onClick={onCreateClick}>
          Create Chapter
        </Button>
      </div>
      <div className="mt-6 space-y-4">
        {timeline.chapters.map((chapter) => (
          <details key={chapter.id} className="group rounded-xl border border-white/10 bg-white/5 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-white/80">
              <div className="flex items-center gap-3">
                <ChapterIcon />
                <div>
                  <p className="text-xs uppercase text-primary/70">{chapter.start_date}</p>
                  <p className="text-base font-semibold">{chapter.title}</p>
                  {chapter.summary && <p className="text-xs text-white/60">{chapter.summary}</p>}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-white/50 transition group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">
              {chapter.description && <p className="text-sm text-white/70">{chapter.description}</p>}
              <EntryPreview months={chapter.months} />
              {onSummarize && (
                <Button size="sm" variant="ghost" onClick={() => onSummarize(chapter.id)}>
                  Summarize Chapter
                </Button>
              )}
            </div>
          </details>
        ))}
        {timeline.chapters.length === 0 && <p className="text-white/50">No chapters yet. Start your first arc.</p>}
      </div>
      <div className="mt-6 rounded-xl border border-white/5 bg-white/5 p-4">
        <p className="text-xs uppercase text-white/50">Unassigned</p>
        <EntryPreview months={timeline.unassigned} />
      </div>
    </div>
  );
};

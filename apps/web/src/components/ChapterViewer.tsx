import { Compass, Map, Sparkles } from 'lucide-react';

import type { ChapterCandidate, ChapterProfile } from '../hooks/useLoreKeeper';
import { Button } from './ui/button';

const formatRange = (start?: string, end?: string | null) => {
  if (!start) return 'Unknown';
  const startDate = new Date(start).toLocaleDateString();
  const endDate = end ? new Date(end).toLocaleDateString() : 'Now';
  return `${startDate} → ${endDate}`;
};

const TraitPill = ({ label }: { label: string }) => (
  <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">{label}</span>
);

type ChapterViewerProps = {
  chapters: ChapterProfile[];
  candidates?: ChapterCandidate[];
  onRefresh?: () => void;
};

export const ChapterViewer = ({ chapters, candidates = [], onRefresh }: ChapterViewerProps) => {
  return (
    <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Map className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs uppercase text-white/50">Chapters</p>
            <h3 className="text-lg font-semibold text-white">Evolving arcs</h3>
          </div>
        </div>
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} leftIcon={<Sparkles className="h-4 w-4" />}>
            Refresh signals
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {chapters.map((chapter) => (
          <div key={chapter.id} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-primary/70">{formatRange(chapter.start_date, chapter.end_date)}</p>
                <p className="text-lg font-semibold">{chapter.title}</p>
              </div>
              <div className="text-right text-xs text-white/60">{chapter.entry_ids.length} entries</div>
            </div>
            {chapter.summary && <p className="text-sm text-white/70">{chapter.summary}</p>}
            <div className="flex flex-wrap gap-2">
              {chapter.chapter_traits.slice(0, 4).map((trait) => (
                <TraitPill key={trait} label={trait} />
              ))}
              {chapter.chapter_traits.length === 0 && <TraitPill label="growth" />}
            </div>
            {chapter.emotion_cloud.length > 0 && (
              <div className="text-xs text-white/60">
                Emotions: {chapter.emotion_cloud.slice(0, 3).map((facet) => facet.label).join(', ')}
              </div>
            )}
            {chapter.top_tags.length > 0 && (
              <div className="text-xs text-white/60">
                Top tags: {chapter.top_tags.slice(0, 4).map((facet) => facet.label).join(', ')}
              </div>
            )}
          </div>
        ))}
        {chapters.length === 0 && <p className="text-white/60">No chapters found yet.</p>}
      </div>
      {candidates.length > 0 && (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm text-primary/80">
            <Compass className="h-4 w-4" />
            <p>Detected chapter candidates</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-lg border border-primary/30 bg-black/30 p-3 text-sm text-white/80">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{candidate.chapter_title}</p>
                  <span className="text-xs text-primary/80">{Math.round(candidate.confidence * 100)}% signal</span>
                </div>
                <p className="text-xs text-white/60">{formatRange(candidate.start_date, candidate.end_date)}</p>
                <p className="mt-2 text-white/70">{candidate.summary || 'Related entries grouped by time and tags.'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidate.chapter_traits.map((trait) => (
                    <TraitPill key={`${candidate.id}-${trait}`} label={trait} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

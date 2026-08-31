import { X, MessageSquare, Users, MapPin, Star, CalendarDays, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import type { SagaStoryline } from '../../api/saga';
import { openChatWithFocus } from '../../lib/openChatWithFocus';

export interface ChapterContext {
  people: string[];
  places: string[];
}

const TURNING_POINT_STATUSES = new Set(['completed', 'resurfaced']);

function formatDateRange(chapter: SagaStoryline): string | null {
  const start = chapter.timeStart ? new Date(chapter.timeStart).toLocaleDateString() : null;
  const end = chapter.timeEnd ? new Date(chapter.timeEnd).toLocaleDateString() : null;
  if (!start && !end) return null;
  if (!end || start === end) return start;
  return `${start ?? 'Unknown start'} – ${end}`;
}

interface ChapterDetailDrawerProps {
  chapter: SagaStoryline;
  chapterIndex: number;
  era: string;
  context?: ChapterContext;
  onClose: () => void;
}

export const ChapterDetailDrawer = ({
  chapter,
  chapterIndex,
  era,
  context,
  onClose,
}: ChapterDetailDrawerProps) => {
  const navigate = useNavigate();
  const isTurningPoint = TURNING_POINT_STATUSES.has(chapter.status);
  const people = context?.people?.length ? context.people : chapter.participants ?? [];
  const places = context?.places?.length ? context.places : chapter.location ? [chapter.location] : [];
  const dateRange = formatDateRange(chapter);

  const handleChatCTA = () => {
    openChatWithFocus({
      entityId: chapter.id,
      entityName: chapter.title,
      entityType: 'memory',
      sourceSurface: 'saga',
      sourceLabel: 'Life Saga',
      knowledgeScope: `the supporting moments, dates, people, places, and uncertainty behind the ${era} storyline`,
      startNewThread: true,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — bottom sheet on mobile, right panel on md+ */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chapter: ${chapter.title}`}
        className="fixed bottom-0 left-0 right-0 max-h-[82vh] md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[440px] z-50 flex flex-col bg-[#0c0b14] border-t md:border-t-0 md:border-l border-white/10 shadow-2xl rounded-t-2xl md:rounded-none"
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5">
              {isTurningPoint ? (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-400/70 uppercase tracking-wider">
                  <Star className="h-3 w-3" /> Turning Point
                </span>
              ) : (
                <span className="text-xs font-mono text-white/30 uppercase tracking-wider">
                  Storyline {chapterIndex + 1} · {chapter.status}
                </span>
              )}
            </div>
            <h2
              className="text-xl font-bold text-white leading-snug font-serif"
            >
              {chapter.title}
            </h2>
            <p className="text-xs text-white/30 mt-1">{era}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Narrative */}
          <p
            className="text-white/70 leading-relaxed text-base font-serif"
          >
            {chapter.summary}
          </p>

          {(dateRange || chapter.confidence != null) && (
            <div className="flex flex-wrap gap-2">
              {dateRange && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
                  <CalendarDays className="h-3.5 w-3.5 text-primary/70" />
                  {dateRange}
                </span>
              )}
              {chapter.confidence != null && (
                <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-xs text-emerald-100/65">
                  {Math.round(chapter.confidence * 100)}% evidence confidence
                </span>
              )}
            </div>
          )}

          {/* People */}
          {people.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Users className="h-3.5 w-3.5 text-white/25" />
                <span className="text-xs font-mono uppercase tracking-widest text-white/25">People</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {people.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary/80"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Places */}
          {places.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <MapPin className="h-3.5 w-3.5 text-white/25" />
                <span className="text-xs font-mono uppercase tracking-widest text-white/25">Places</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {places.map((place) => (
                  <span
                    key={place}
                    className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400/80"
                  >
                    {place}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs text-white/40">
            <p>
              Grounded in {chapter.sceneIds?.length ?? 0} moments and {chapter.eventIds?.length ?? 0} timeline events.
              This is a derived storyline, not a confirmed fact.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/timeline?view=search&q=${encodeURIComponent(chapter.title)}`)}
              className="mt-2 inline-flex items-center gap-1.5 text-primary/80 hover:text-primary"
            >
              View supporting moments <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-5 py-4 border-t border-white/8 shrink-0 pb-safe">
          <Button
            onClick={handleChatCTA}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl"
          >
            <MessageSquare className="h-4 w-4 mr-2 shrink-0" />
            Continue in Chat
          </Button>
        </div>
      </div>
    </>
  );
};

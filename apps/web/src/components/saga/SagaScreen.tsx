import { useState } from 'react';
import { BookOpen, Sparkles, Zap, RotateCcw, Star, MessageSquare, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSaga } from '../../hooks/useSaga';
import { Button } from '../ui/button';
import { ChapterDetailDrawer, type ChapterContext } from './ChapterDetailDrawer';
import type { SagaChapter } from '../../api/saga';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_SAGA = {
  era: 'The Creative Renaissance',
  arcs: [
    { id: 'a1', label: 'Creative Growth', intensity: 87 },
    { id: 'a2', label: 'Professional Evolution', intensity: 72 },
    { id: 'a3', label: 'Relational Depth', intensity: 65 },
    { id: 'a4', label: 'Personal Clarity', intensity: 54 },
  ],
  chapters: [
    {
      id: 'c1',
      title: 'The Leap',
      summary: 'Left the stable career to pursue music production. The fear was real, but so was the pull.',
      turningPoint: true,
    },
    {
      id: 'c2',
      title: 'Sarah',
      summary: 'Met Sarah Chen at the coffee shop on Valencia. Within a month she was the person you called first.',
      turningPoint: false,
    },
    {
      id: 'c3',
      title: 'The Studio Year',
      summary: 'Twelve months of building something from nothing. Late nights. Breakthroughs. Doubt. Then: the first track.',
      turningPoint: false,
    },
    {
      id: 'c4',
      title: 'A Fork in the Road',
      summary: 'The offer from the agency came at exactly the wrong time. Or maybe the right time.',
      turningPoint: true,
    },
    {
      id: 'c5',
      title: 'Barcelona',
      summary: "Three weeks in a city that didn't know your name. Something reset.",
      turningPoint: false,
    },
    {
      id: 'c6',
      title: 'Now',
      summary: "The most uncertain chapter yet. But uncertainty feels different now — it feels like momentum.",
      turningPoint: false,
    },
  ],
};

// Mock entity context per chapter (used in demo mode)
const MOCK_CHAPTER_CONTEXT: Record<string, ChapterContext> = {
  c1: { people: ['Marcus Webb', 'Joanna Park'], places: ['San Francisco', 'The Old Office'] },
  c2: { people: ['Sarah Chen'], places: ['Valencia Coffee Shop', 'Mission District'] },
  c3: { people: ['Marcus Webb', 'DJ Kira'], places: ['Home Studio', 'The Warehouse'] },
  c4: { people: ['Marcus Webb', 'Joanna Park'], places: ['Downtown Office', 'The Agency'] },
  c5: { people: [], places: ['Barcelona', 'El Born', 'La Barceloneta'] },
  c6: { people: ['Sarah Chen', 'Marcus Webb', 'Joanna Park'], places: [] },
};

// ─── Colours ─────────────────────────────────────────────────────────────────

const ARC_COLORS = [
  { bar: 'from-purple-500 to-indigo-500', text: 'text-purple-300', hover: 'hover:text-purple-200' },
  { bar: 'from-cyan-500 to-blue-500', text: 'text-cyan-300', hover: 'hover:text-cyan-200' },
  { bar: 'from-pink-500 to-rose-500', text: 'text-pink-300', hover: 'hover:text-pink-200' },
  { bar: 'from-amber-500 to-orange-500', text: 'text-amber-300', hover: 'hover:text-amber-200' },
  { bar: 'from-emerald-500 to-teal-500', text: 'text-emerald-300', hover: 'hover:text-emerald-200' },
  { bar: 'from-violet-500 to-purple-500', text: 'text-violet-300', hover: 'hover:text-violet-200' },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface DrawerState {
  chapter: SagaChapter;
  chapterIndex: number;
  context?: ChapterContext;
}

export const SagaScreen = () => {
  const { saga: realSaga, refresh, loading, isMock } = useSaga();
  const saga = isMock ? MOCK_SAGA : realSaga;
  const navigate = useNavigate();

  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const openChapter = (chapter: SagaChapter, chapterIndex: number) => {
    const context = isMock ? MOCK_CHAPTER_CONTEXT[chapter.id] : undefined;
    setDrawer({ chapter, chapterIndex, context });
  };

  const handleChatEra = () => {
    if (!saga) return;
    navigate('/chat', {
      state: { prefill: `Tell me about the current era of my life: "${saga.era}"` },
    });
  };

  const handleArcClick = (arcId: string) => {
    navigate(`/timeline?arc=${arcId}`);
  };

  const turningPoints = saga?.chapters.filter((c) => c.turningPoint) ?? [];
  const regularChapters = saga?.chapters.filter((c) => !c.turningPoint) ?? [];

  // Map each chapter to its position in the full list for numbering
  const chapterIndexMap = new Map<string, number>(
    (saga?.chapters ?? []).map((c, i) => [c.id, i])
  );

  return (
    <>
      <div className="h-full overflow-y-auto bg-gradient-to-br from-black via-[#0b0714] to-black">
        {/* Atmospheric layers */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(139,92,246,0.10),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_70%,rgba(6,182,212,0.07),transparent_50%)]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12">

          {/* Header */}
          <div className="flex items-start justify-between mb-8 sm:mb-12">
            <div className="flex-1 min-w-0 pr-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-3">
                <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                <span className="text-xs text-primary/70 font-mono tracking-wider uppercase">Life Saga</span>
              </div>
              <h1
                className="text-2xl sm:text-4xl font-bold text-white leading-tight font-serif"
              >
                {saga ? saga.era : 'Your Story'}
              </h1>
              <p className="text-white/40 text-sm mt-1.5 max-w-xs">
                The arcs, chapters, and turning points that make up your life narrative.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 mt-1">
              {/* Chat about this era */}
              {saga && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleChatEra}
                  className="text-white/50 hover:text-white hover:bg-primary/10 border border-white/10 hover:border-primary/30 gap-1.5 text-xs"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Chat about this era</span>
                  <span className="sm:hidden">Chat</span>
                </Button>
              )}
              {/* Refresh */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refresh()}
                disabled={loading}
                className="text-white/30 hover:text-white/60 px-2"
                aria-label="Refresh"
              >
                <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Loading skeleton */}
          {loading && !saga && (
            <div className="space-y-6 animate-pulse">
              <div className="h-32 rounded-2xl bg-white/5" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 rounded-2xl bg-white/5" />)}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !saga && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="h-12 w-12 text-white/15 mb-4" />
              <p className="text-white/40 text-sm max-w-xs">
                Your saga will appear here once you have life arcs and chapters. Start by chatting about your story.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/chat')}
                className="mt-4 text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/40"
              >
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Start in Chat
              </Button>
            </div>
          )}

          {saga && (
            <div className="space-y-10">

              {/* Active Arcs — clickable, navigate to timeline */}
              {saga.arcs.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-primary/60" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Active Arcs</h2>
                    <span className="text-xs text-white/20 font-mono ml-auto">tap to explore in timeline →</span>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-6 space-y-4">
                    {saga.arcs.map((arc, i) => {
                      const color = ARC_COLORS[i % ARC_COLORS.length];
                      return (
                        <button
                          key={arc.id}
                          type="button"
                          onClick={() => handleArcClick(arc.id)}
                          className="group w-full text-left"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-sm font-medium ${color.text} ${color.hover} transition-colors group-hover:underline underline-offset-2 decoration-dotted`}>
                              {arc.label}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-white/30 font-mono">{arc.intensity}%</span>
                              <ChevronRight className="h-3 w-3 text-white/15 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${color.bar} transition-all duration-700`}
                              style={{ width: `${arc.intensity}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Turning Points */}
              {turningPoints.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="h-4 w-4 text-amber-400/60" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Turning Points</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {turningPoints.map((chapter) => {
                      const idx = chapterIndexMap.get(chapter.id) ?? 0;
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() => openChapter(chapter, idx)}
                          className="group relative text-left rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-orange-950/20 to-black/40 p-5 hover:border-amber-500/50 hover:from-amber-950/60 active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-xs font-mono text-amber-400/70 uppercase tracking-wider">Turning Point</span>
                            <Star className="h-3.5 w-3.5 text-amber-400/50 shrink-0 mt-0.5" />
                          </div>
                          <h3
                            className="text-lg font-bold text-white mb-2 leading-snug font-serif"
                          >
                            {chapter.title}
                          </h3>
                          <p className="text-sm text-white/55 leading-relaxed line-clamp-2">
                            {chapter.summary}
                          </p>
                          <div className="mt-3 flex items-center gap-1 text-xs text-amber-400/40 group-hover:text-amber-400/70 transition-colors">
                            <span>Open</span>
                            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Regular Chapters */}
              {regularChapters.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-4 w-4 text-primary/60" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Chapters</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {regularChapters.map((chapter) => {
                      const idx = chapterIndexMap.get(chapter.id) ?? 0;
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() => openChapter(chapter, idx)}
                          className="group text-left rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-primary/20 active:scale-[0.98] p-5 transition-all"
                        >
                          <span className="text-xs font-mono text-white/25 mb-2 block">
                            Chapter {idx + 1}
                          </span>
                          <h3
                            className="text-base font-semibold text-white mb-2 leading-snug font-serif"
                          >
                            {chapter.title}
                          </h3>
                          <p className="text-sm text-white/45 leading-relaxed line-clamp-3">
                            {chapter.summary}
                          </p>
                          <div className="mt-3 flex items-center gap-1 text-xs text-white/20 group-hover:text-white/50 transition-colors">
                            <span>Open</span>
                            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {saga.chapters.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-white/8 bg-white/2 text-center">
                  <BookOpen className="h-10 w-10 text-white/15 mb-3" />
                  <p className="text-sm text-white/35">No chapters yet. Your story is still being written.</p>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Chapter detail drawer */}
      {drawer && (
        <ChapterDetailDrawer
          chapter={drawer.chapter}
          chapterIndex={drawer.chapterIndex}
          era={saga?.era ?? ''}
          context={drawer.context}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
};

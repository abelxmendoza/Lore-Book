import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Copy, Sparkles, Zap, RotateCcw, Star, MessageSquare, ChevronRight, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSaga } from '../../hooks/useSaga';
import { useIsMobile } from '../../hooks/useIsMobile';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { buildLifeSagaClipboardText } from '../../lib/sagaClipboard';
import { Button } from '../ui/button';
import { ChapterDetailDrawer, type ChapterContext } from './ChapterDetailDrawer';
import type { SagaOverview, SagaStoryline } from '../../api/saga';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_SAGA: SagaOverview = {
  era: 'The Creative Renaissance',
  currentStorylines: [
    { id: 'c3', label: 'The Studio Year', intensity: 87 },
    { id: 'c4', label: 'A Fork in the Road', intensity: 72 },
    { id: 'c2', label: 'Falling for Sarah', intensity: 65 },
    { id: 'c6', label: 'Finding Stillness', intensity: 54 },
  ],
  turningPoints: [
    { id: 'tp1', title: 'The Leap', date: null, kind: 'career_change', importance: 0.92 },
    { id: 'tp2', title: 'A Fork in the Road', date: null, kind: 'job_offer', importance: 0.81 },
  ],
  eras: [
    {
      id: 'e1',
      title: 'The Creative Renaissance',
      summary: 'Leaving a stable career to build something of your own.',
      isCurrent: true,
      chapters: [
        {
          id: 'ch-creative',
          title: 'Creative Work',
          domain: 'creative',
          summary: 'Building something from nothing.',
          storylines: [
            {
              id: 'c1',
              title: 'The Leap',
              summary:
                'Left the stable career to pursue music production. The fear was real, but so was the pull.',
              domain: 'creative',
              status: 'completed',
              momentum: 'steady',
              intensity: 90,
              eventIds: [],
            },
            {
              id: 'c3',
              title: 'The Studio Year',
              summary:
                'Twelve months of building something from nothing. Late nights. Breakthroughs. Doubt. Then: the first track.',
              domain: 'creative',
              status: 'active',
              momentum: 'increasing',
              intensity: 87,
              eventIds: [],
            },
          ],
        },
        {
          id: 'ch-romance',
          title: 'Dating & Romance',
          domain: 'romance',
          summary: 'A new connection that became the person you called first.',
          storylines: [
            {
              id: 'c2',
              title: 'Falling for Sarah',
              summary:
                'Met Sarah Chen at the coffee shop on Valencia. Within a month she was the person you called first.',
              domain: 'romance',
              status: 'active',
              momentum: 'steady',
              intensity: 65,
              eventIds: [],
            },
          ],
        },
        {
          id: 'ch-career',
          title: 'Career',
          domain: 'career',
          summary: 'An old world pulling you back at the wrong — or right — time.',
          storylines: [
            {
              id: 'c4',
              title: 'A Fork in the Road',
              summary: 'The offer from the agency came at exactly the wrong time. Or maybe the right time.',
              domain: 'career',
              status: 'resurfaced',
              momentum: 'increasing',
              intensity: 72,
              eventIds: [],
            },
          ],
        },
        {
          id: 'ch-travel',
          title: 'Travel',
          domain: 'travel',
          summary: 'Distance that reset something.',
          storylines: [
            {
              id: 'c5',
              title: 'Barcelona',
              summary: "Three weeks in a city that didn't know your name. Something reset.",
              domain: 'travel',
              status: 'completed',
              momentum: 'steady',
              intensity: 40,
              eventIds: [],
            },
          ],
        },
        {
          id: 'ch-clarity',
          title: 'Personal Growth',
          domain: 'health',
          summary: 'Uncertainty that started to feel like momentum.',
          storylines: [
            {
              id: 'c6',
              title: 'Finding Stillness',
              summary:
                'The most uncertain chapter yet. But uncertainty feels different now — it feels like momentum.',
              domain: 'health',
              status: 'emerging',
              momentum: 'increasing',
              intensity: 54,
              eventIds: [],
            },
          ],
        },
      ],
    },
  ],
};

// Mock entity context per storyline (used in demo mode)
const MOCK_STORYLINE_CONTEXT: Record<string, ChapterContext> = {
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
  chapter: SagaStoryline;
  chapterIndex: number;
  context?: ChapterContext;
}

export const SagaScreen = ({ onOpenAppSidebar }: { onOpenAppSidebar?: () => void } = {}) => {
  const { saga: realSaga, refresh, loading, isMock } = useSaga();
  const saga = isMock ? MOCK_SAGA : realSaga;
  const navigate = useNavigate();
  const isMobile = useIsMobile(1024);

  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const clipboardText = useMemo(() => buildLifeSagaClipboardText(saga), [saga]);

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(clipboardText);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const openStoryline = (storyline: SagaStoryline, storylineIndex: number) => {
    const context = isMock ? MOCK_STORYLINE_CONTEXT[storyline.id] : undefined;
    setDrawer({ chapter: storyline, chapterIndex: storylineIndex, context });
  };

  const handleChatEra = () => {
    if (!saga) return;
    navigate('/chat', {
      state: { prefill: `Tell me about the current era of my life: "${saga.era}"` },
    });
  };

  const handleStorylineClick = (storylineId: string) => {
    navigate(`/timeline?arc=${storylineId}`);
  };

  // Most recent era first; number storylines within each chapter for drawer display
  const orderedEras = useMemo(() => [...(saga?.eras ?? [])].reverse(), [saga]);
  const storylineIndexById = useMemo(() => {
    const map = new Map<string, number>();
    for (const era of saga?.eras ?? []) {
      for (const chapter of era.chapters) {
        chapter.storylines.forEach((s, i) => map.set(s.id, i));
      }
    }
    return map;
  }, [saga]);

  const totalStorylineCount = (saga?.eras ?? []).reduce(
    (sum, era) => sum + era.chapters.reduce((cSum, c) => cSum + c.storylines.length, 0),
    0,
  );
  const copyDisabled = !saga || (!saga.currentStorylines.length && totalStorylineCount === 0);

  return (
    <>
      <div className="flex flex-col h-full min-h-0 bg-gradient-to-br from-black via-[#0b0714] to-black">
        {isMobile && (
          <header
            className="flex-shrink-0 border-b border-white/8 bg-black/95 backdrop-blur-md px-3 py-2.5 z-20"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <div className="flex items-center gap-2.5">
              {onOpenAppSidebar && (
                <button
                  type="button"
                  onClick={onOpenAppSidebar}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/60 active:bg-white/10"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold text-white truncate">Life Saga</h1>
                {saga?.era && (
                  <p className="text-[11px] text-white/45 truncate mt-0.5">{saga.era}</p>
                )}
              </div>
              {saga && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCopyAll()}
                    disabled={copyDisabled}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border active:bg-white/10 disabled:opacity-40 ${
                      copied
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : 'border-white/10 text-white/50'
                    }`}
                    title="Copy all Life Saga content as plain text"
                    aria-label="Copy all Life Saga"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleChatEra}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/50 active:bg-white/10"
                    aria-label="Chat about this era"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </header>
        )}

        <div className="relative flex-1 min-h-0 overflow-y-auto">
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
                The storylines, chapters, and turning points that make up your life narrative.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 mt-1">
              {saga && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleCopyAll()}
                    disabled={copyDisabled}
                    className={`gap-1.5 text-xs border ${
                      copied
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : 'text-white/50 hover:text-white hover:bg-white/5 border-white/10 hover:border-white/25'
                    }`}
                    title="Copy all Life Saga content as plain text"
                    aria-label="Copy all Life Saga"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy all'}</span>
                  </Button>
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
                </>
              )}
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
                Your saga will appear here once you have life storylines and chapters. Start by chatting about your story.
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

              {/* Current Storylines — clickable, navigate to timeline */}
              {saga.currentStorylines.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-primary/60" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Current Storylines</h2>
                    <span className="text-xs text-white/20 font-mono ml-auto">tap to explore in timeline →</span>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-6 space-y-4">
                    {saga.currentStorylines.map((storyline, i) => {
                      const color = ARC_COLORS[i % ARC_COLORS.length];
                      return (
                        <button
                          key={storyline.id}
                          type="button"
                          onClick={() => handleStorylineClick(storyline.id)}
                          className="group w-full text-left"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-sm font-medium ${color.text} ${color.hover} transition-colors group-hover:underline underline-offset-2 decoration-dotted`}>
                              {storyline.label}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-white/30 font-mono">{storyline.intensity}%</span>
                              <ChevronRight className="h-3 w-3 text-white/15 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${color.bar} transition-all duration-700`}
                              style={{ width: `${storyline.intensity}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Turning Points */}
              {saga.turningPoints.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="h-4 w-4 text-amber-400/60" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Turning Points</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {saga.turningPoints.map((tp) => (
                      <div
                        key={tp.id}
                        className="group relative text-left rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-orange-950/20 to-black/40 p-5"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-xs font-mono text-amber-400/70 uppercase tracking-wider">
                            {tp.kind.replace(/_/g, ' ')}
                          </span>
                          <Star className="h-3.5 w-3.5 text-amber-400/50 shrink-0 mt-0.5" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 leading-snug font-serif">{tp.title}</h3>
                        {tp.date && (
                          <p className="text-xs text-white/40">{new Date(tp.date).toLocaleDateString()}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Eras → Chapters → Storylines */}
              {orderedEras.map((era) => (
                <section key={era.id}>
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-4 w-4 text-primary/60" />
                    <h2 className="text-sm font-semibold text-white font-serif">{era.title}</h2>
                    {era.isCurrent && (
                      <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/70 border border-emerald-500/25 rounded-full px-2 py-0.5">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="space-y-6">
                    {era.chapters.map((chapter) => (
                      <div key={chapter.id}>
                        <h3 className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">
                          {chapter.title}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {chapter.storylines.map((storyline) => {
                            const idx = storylineIndexById.get(storyline.id) ?? 0;
                            return (
                              <button
                                key={storyline.id}
                                type="button"
                                onClick={() => openStoryline(storyline, idx)}
                                className="group text-left rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-primary/20 active:scale-[0.98] p-5 transition-all"
                              >
                                <span className="text-xs font-mono text-white/25 mb-2 block capitalize">
                                  {storyline.status} · {storyline.momentum}
                                </span>
                                <h4 className="text-base font-semibold text-white mb-2 leading-snug font-serif">
                                  {storyline.title}
                                </h4>
                                <p className="text-sm text-white/45 leading-relaxed line-clamp-3">
                                  {storyline.summary}
                                </p>
                                <div className="mt-3 flex items-center gap-1 text-xs text-white/20 group-hover:text-white/50 transition-colors">
                                  <span>Open</span>
                                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {totalStorylineCount === 0 && (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-white/8 bg-white/2 text-center">
                  <BookOpen className="h-10 w-10 text-white/15 mb-3" />
                  <p className="text-sm text-white/35">No chapters yet. Your story is still being written.</p>
                </div>
              )}

            </div>
          )}
        </div>
        </div>
      </div>

      {/* Storyline detail drawer */}
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

import { useState } from 'react';
import {
  BookOpen, BookMarked, Search, Sparkles, User, Briefcase, Clock,
  Heart, Zap, MapPin, Calendar, Loader2, ChevronRight, Edit3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { LorebookEvidenceReview } from './LorebookEvidenceReview';

interface BookCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
  gradient: string;
  description: string;
}

const CATEGORIES: BookCategory[] = [
  { id: 'biography',    label: 'Full Biography',  icon: BookOpen,   prompt: 'my complete life story',       gradient: 'from-purple-600 to-indigo-700',  description: 'Everything, start to finish' },
  { id: 'person',       label: 'A Person',         icon: User,       prompt: 'my story with ',               gradient: 'from-pink-600 to-rose-700',       description: 'One relationship, in full' },
  { id: 'career',       label: 'Career',           icon: Briefcase,  prompt: 'my professional journey',      gradient: 'from-blue-600 to-cyan-700',       description: 'Work, skills, and growth' },
  { id: 'era',          label: 'An Era',           icon: Clock,      prompt: 'my life in ',                  gradient: 'from-amber-600 to-orange-700',    description: 'A chapter by year or period' },
  { id: 'relationship', label: 'Relationship',     icon: Heart,      prompt: 'my relationship history',      gradient: 'from-red-500 to-pink-700',        description: 'Love and connection' },
  { id: 'skill',        label: 'A Skill',          icon: Zap,        prompt: 'my journey learning ',         gradient: 'from-green-600 to-emerald-700',   description: 'How you built something' },
  { id: 'place',        label: 'A Place',          icon: MapPin,     prompt: 'my story at ',                 gradient: 'from-teal-600 to-cyan-700',       description: 'A location and its meaning' },
  { id: 'event',        label: 'An Event',         icon: Calendar,   prompt: 'the story of ',                gradient: 'from-violet-600 to-purple-700',   description: 'One moment, zoomed in' },
];

import { lorebookLibraryUrl } from '../../lib/lorebookLibrary';
import { cn } from '../../lib/cn';
import { DEMO_LOREBOOK_CATALOG } from '../../mocks/lorebooks';
import { LorebookGeneratorSectionTitle, LorebookLibraryHero } from './LorebookSectionTitles';
import { LoreReadinessPanel } from './LoreReadinessPanel';
import { useLorebookShell } from './LorebookShell';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import { useQueryReadiness } from '../../hooks/useQueryReadiness';
import { READINESS_COLORS, READINESS_LABELS } from '../../lib/loreReadiness';
import type { CompiledLorebook } from '../../hooks/useLoreReadiness';

const LIBRARY_BOOK_STYLES = [
  { gradient: 'from-purple-600 to-indigo-700', accent: 'text-purple-300', border: 'border-purple-500/25' },
  { gradient: 'from-emerald-600 to-teal-700', accent: 'text-emerald-300', border: 'border-emerald-500/25' },
  { gradient: 'from-amber-600 to-orange-700', accent: 'text-amber-300', border: 'border-amber-500/25' },
  { gradient: 'from-pink-600 to-rose-700', accent: 'text-pink-300', border: 'border-pink-500/25' },
] as const;

function libraryBookPresentation(book: CompiledLorebook, index: number) {
  const catalog = DEMO_LOREBOOK_CATALOG.find((entry) => entry.id === book.id);
  const style = LIBRARY_BOOK_STYLES[index % LIBRARY_BOOK_STYLES.length];
  return {
    title: book.title,
    scope: book.is_core_lorebook ? 'Core edition' : book.lorebook_name ?? catalog?.scope ?? 'Compiled lorebook',
    period: catalog?.period ?? new Date(book.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    chapters: book.chapterCount ?? catalog?.chapters ?? 0,
    pages: catalog?.pages ?? Math.max((book.chapterCount ?? 0) * 4, book.chapterCount ?? 0),
    gradient: catalog?.gradient ?? style.gradient,
    accent: catalog?.accent ?? style.accent,
    border: catalog?.border ?? style.border,
  };
}

interface LibraryLandingProps {
  onGenerate: (query: string, options?: { force?: boolean }) => void;
  onGenerateTopic?: (
    topicId: string,
    options?: {
      characterId?: string;
      locationId?: string;
      organizationId?: string;
      skillId?: string;
      threadId?: string;
      timeRange?: { start: string; end: string };
      themes?: string[];
    },
  ) => void;
  onReadBook?: (bookId: string) => void;
  onEditBook?: (bookId: string) => void;
  generating?: boolean;
  /** @deprecated Library rows come from compiled lorebooks only. */
  isMockData?: boolean;
  /** Slot rendered below the "Recently generated" section — e.g. saved books, recommendations. */
  bottomSlot?: React.ReactNode;
}

export const LibraryLanding = ({
  onGenerate,
  onGenerateTopic,
  onReadBook,
  onEditBook,
  generating = false,
  bottomSlot,
}: LibraryLandingProps) => {
  const navigate = useNavigate();
  const inShell = useLorebookShell();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showEvidenceReview, setShowEvidenceReview] = useState(false);
  const { readiness, compiledBooks, loading: readinessLoading } = useLoreReadiness();
  const { evaluation: queryEvaluation, loading: queryEvaluating } = useQueryReadiness(query);

  const handleCategoryClick = (cat: BookCategory) => {
    setActiveCategory(cat.id);
    setQuery(cat.prompt);
    setShowEvidenceReview(false);
    // Focus the input after selecting a category
    setTimeout(() => {
      const input = document.getElementById('library-search-input');
      if (input) {
        input.focus();
        (input as HTMLInputElement).setSelectionRange(cat.prompt.length, cat.prompt.length);
      }
    }, 50);
  };

  const handleSubmit = () => {
    if (!query.trim() || generating) return;
    // Evidence review before prose — product workflow step 2.
    setShowEvidenceReview(true);
  };

  const handleConfirmCompile = (force = false) => {
    if (!query.trim() || generating) return;
    onGenerate(query.trim(), force ? { force: true } : undefined);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain bg-gradient-to-br from-black via-[#0d0814] to-black">
      {/* Atmospheric background layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(139,92,246,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(236,72,153,0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(88,28,135,0.04),transparent_70%)]" />
      </div>

      <div className={`relative z-10 mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col px-4 py-6 sm:px-8 sm:py-12 lg:px-16 ${inShell ? 'pb-4' : ''}`}>

        <LorebookLibraryHero subtitle="Compile a book from your living memory — review the evidence first, then write." />

        {/* Generation search bar */}
        <div className="mb-6 sm:mb-8">
          <LorebookGeneratorSectionTitle />
          <div className="relative flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/25 pointer-events-none" />
              <input
                id="library-search-input"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowEvidenceReview(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g. 'my 2020 story', 'Sarah', 'my music journey'…"
                className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/5 border border-white/10 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-all"
                style={{ fontFamily: 'Georgia, serif' }}
              />
            </div>
            <Button
              onClick={() => handleSubmit()}
              disabled={!query.trim() || generating}
              className="h-14 w-14 sm:w-auto sm:px-6 rounded-2xl bg-primary hover:bg-primary/90 text-white font-semibold shrink-0 disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-5 w-5 sm:mr-2 shrink-0" />
                  <span className="hidden sm:inline">Review</span>
                </>
              )}
            </Button>
          </div>
          {query.trim().length >= 3 && !showEvidenceReview && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {queryEvaluating ? (
                <span className="inline-flex items-center gap-1.5 text-white/40">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking knowledge for this book…
                </span>
              ) : queryEvaluation ? (
                <>
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium', READINESS_COLORS[queryEvaluation.level])}>
                    {READINESS_LABELS[queryEvaluation.level]} · {Math.round(queryEvaluation.progress * 100)}%
                  </span>
                  <span className="text-white/35 font-mono">
                    {queryEvaluation.atomCount} atoms · ~{queryEvaluation.estimatedPages} pages
                  </span>
                </>
              ) : null}
            </div>
          )}
          {showEvidenceReview && queryEvaluation && (
            <div className="mt-4">
              <LorebookEvidenceReview
                evaluation={queryEvaluation}
                query={query.trim()}
                loading={queryEvaluating}
                compiling={generating}
                onConfirmCompile={handleConfirmCompile}
                onCancel={() => setShowEvidenceReview(false)}
              />
            </div>
          )}
          {showEvidenceReview && !queryEvaluation && !queryEvaluating && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
              Could not evaluate evidence for this query. You can still try compiling, or chat more first.
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmCompile(true)}
                  className="rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium px-3 py-2"
                >
                  Compile anyway
                </button>
                <button
                  type="button"
                  onClick={() => setShowEvidenceReview(false)}
                  className="rounded-lg text-xs text-white/45 px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category chips */}
        <div className="mb-8 sm:mb-12">
          <p className="text-xs text-white/35 uppercase tracking-widest font-mono mb-3">Or choose a focus</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat)}
                  className={`group flex items-center gap-2.5 px-3 py-3 min-h-[56px] rounded-xl border text-left transition-all active:scale-[0.97] ${
                    isActive
                      ? 'border-primary/50 bg-primary/10 text-white'
                      : 'border-white/8 bg-white/3 text-white/60 hover:border-white/20 hover:bg-white/6 hover:text-white'
                  }`}
                >
                  <div className={`rounded-lg p-2 bg-gradient-to-br ${cat.gradient} shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{cat.label}</div>
                    <div className="text-xs text-white/35 truncate hidden sm:block">{cat.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Knowledge readiness — compile before edit */}
        {readiness && (
          <div className="mb-8 sm:mb-10">
            <LoreReadinessPanel
              readiness={readiness}
              compiledBooks={compiledBooks}
              loading={readinessLoading}
              variant="compact"
              onGenerateTopic={(topicId, options) => {
                if (onGenerateTopic) {
                  onGenerateTopic(topicId, options);
                  return;
                }
                handleSubmit();
              }}
              onGoToChat={() => navigate('/chat')}
            />
          </div>
        )}

        {/* Library entry */}
        <div className="mb-8 sm:mb-10">
          <button
            type="button"
            onClick={() => navigate(lorebookLibraryUrl())}
            className="group w-full flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 px-4 py-3.5 text-left transition-all"
          >
            <div className="shrink-0 p-2 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 opacity-90 group-hover:opacity-100 transition-opacity">
              <BookMarked className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white group-hover:text-primary/90 transition-colors">Enter LoreBook Library</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary/50 group-hover:translate-x-0.5 shrink-0 transition-all" />
          </button>
        </div>

        {/* Your library — compiled books only */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-white/35 uppercase tracking-widest font-mono">Your library</p>
            {compiledBooks.length > 0 && (
              <span className="text-xs text-white/25 font-mono">
                {compiledBooks.length} compiled
              </span>
            )}
          </div>

          {compiledBooks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {compiledBooks.map((book, index) => {
                const presentation = libraryBookPresentation(book, index);
                return (
                  <div
                    key={book.id}
                    className={`group relative flex items-stretch gap-0 rounded-2xl border ${presentation.border} overflow-hidden text-left transition-all hover:shadow-xl hover:shadow-black/40`}
                  >
                    <div className={`w-14 shrink-0 bg-gradient-to-b ${presentation.gradient} flex items-center justify-center`}>
                      <BookOpen className="h-5 w-5 text-white/60" />
                    </div>
                    <div className="flex-1 bg-white/3 group-hover:bg-white/5 transition-colors px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${presentation.accent}`}>{presentation.scope}</p>
                          <h3 className="text-white font-semibold text-base leading-snug mb-1 font-serif">{presentation.title}</h3>
                          <p className="text-xs text-white/40">{presentation.period}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/8">
                        <span className="text-xs text-white/30">{presentation.chapters} chapters</span>
                        <span className="text-white/15">·</span>
                        <span className="text-xs text-white/30">{presentation.pages} pages</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => onReadBook?.(book.id)}
                          className="flex-1 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-medium py-2 transition-colors"
                        >
                          Read
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditBook?.(book.id)}
                          className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium py-2 transition-colors inline-flex items-center justify-center gap-1"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-white/8 bg-white/2 text-center">
              <BookOpen className="h-10 w-10 text-white/15 mb-3" />
              <p className="text-sm text-white/35">Generate a book above — compiled copies appear here for reading and editing.</p>
            </div>
          )}
        </div>

        {bottomSlot}
      </div>
    </div>
  );
};

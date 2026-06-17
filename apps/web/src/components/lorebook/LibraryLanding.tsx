import { useState } from 'react';
import {
  BookOpen, Search, Sparkles, User, Briefcase, Clock,
  Heart, Zap, MapPin, Calendar, Loader2, BookMarked, ChevronRight, Edit3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';

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

import { cn } from '../../lib/cn';
import { DEMO_LOREBOOK_CATALOG } from '../../mocks/lorebooks';
import { LoreReadinessPanel } from './LoreReadinessPanel';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import { READINESS_COLORS, READINESS_LABELS } from '../../lib/loreReadiness';

interface LibraryLandingProps {
  onGenerate: (query: string) => void;
  onReadBook?: (bookId: string) => void;
  onEditBook?: (bookId: string) => void;
  generating?: boolean;
  isMockData?: boolean;
  /** Slot rendered below the "Recently generated" section — e.g. saved books, recommendations. */
  bottomSlot?: React.ReactNode;
}

export const LibraryLanding = ({
  onGenerate,
  onReadBook,
  onEditBook,
  generating = false,
  isMockData = false,
  bottomSlot,
}: LibraryLandingProps) => {
  const navigate = useNavigate();
  const { readiness, compiledBooks, loading: readinessLoading } = useLoreReadiness();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleCategoryClick = (cat: BookCategory) => {
    setActiveCategory(cat.id);
    setQuery(cat.prompt);
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
    onGenerate(query.trim());
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-black via-[#0d0814] to-black overflow-y-auto">
      {/* Atmospheric background layers */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(139,92,246,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(236,72,153,0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(88,28,135,0.04),transparent_70%)]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 px-4 sm:px-8 lg:px-16 py-6 sm:py-12 max-w-5xl mx-auto w-full">

        {/* Header */}
        <div className="text-center mb-7 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-4">
            <BookMarked className="h-3.5 w-3.5 text-primary/70" />
            <span className="text-xs text-primary/70 font-mono tracking-wider uppercase">LoreBook Library</span>
          </div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Your LoreBook Library
          </h1>
          <p className="text-white/50 text-sm sm:text-base max-w-sm mx-auto">
            Generate a book from your life, or open one you've made.
          </p>
        </div>

        {/* Generation search bar */}
        <div className="mb-6 sm:mb-8">
          <div className="relative flex items-center gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/25 pointer-events-none" />
              <input
                id="library-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g. 'my 2020 story', 'Sarah', 'my music journey'…"
                className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/5 border border-white/10 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-all"
                style={{ fontFamily: 'Georgia, serif' }}
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!query.trim() || generating}
              className="h-14 w-14 sm:w-auto sm:px-6 rounded-2xl bg-primary hover:bg-primary/90 text-white font-semibold shrink-0 disabled:opacity-40"
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-5 w-5 sm:mr-2 shrink-0" />
                  <span className="hidden sm:inline">Generate</span>
                </>
              )}
            </Button>
          </div>
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
              onGenerateTopic={() => handleSubmit()}
              onGoToChat={() => navigate('/')}
            />
          </div>
        )}

        {/* Editor entry — only when compiled books exist */}
        <div className="mb-8 sm:mb-10">
          {compiledBooks.length > 0 ? (
            <button
              type="button"
              onClick={() => navigate(`/memoir?book=${encodeURIComponent(compiledBooks[0].id)}`)}
              className="group w-full flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-3.5 text-left transition-all"
            >
              <div className="shrink-0 p-2 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 opacity-90 group-hover:opacity-100 transition-opacity">
                <Edit3 className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-emerald-100 transition-colors">Edit compiled lorebook</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {compiledBooks.length} compiled · opens the editor on generated chapters
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-emerald-400/50 group-hover:translate-x-0.5 shrink-0 transition-all" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/memoir')}
              className="group w-full flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 px-4 py-3.5 text-left transition-all opacity-90"
            >
              <div className="shrink-0 p-2 rounded-lg bg-gradient-to-br from-indigo-600/60 to-violet-700/60">
                <Edit3 className="h-4 w-4 text-white/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/60">Lore editor (locked)</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {readiness?.canGenerateAnyBook
                    ? 'Compile a lorebook first — then editing unlocks'
                    : readiness
                      ? `${READINESS_LABELS[readiness.overallLevel]} · keep chatting to build knowledge`
                      : 'Compile a lorebook before editing'}
                </p>
              </div>
              {readiness && (
                <span className={cn('text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border shrink-0', READINESS_COLORS[readiness.overallLevel])}>
                  {READINESS_LABELS[readiness.overallLevel]}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Your library */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-white/35 uppercase tracking-widest font-mono">Your library</p>
            {isMockData && <span className="text-xs text-white/25 font-mono">{DEMO_LOREBOOK_CATALOG.length} books</span>}
          </div>

          {isMockData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DEMO_LOREBOOK_CATALOG.map((book) => (
                <div
                  key={book.id}
                  className={`group relative flex items-stretch gap-0 rounded-2xl border ${book.border} overflow-hidden text-left transition-all hover:shadow-xl hover:shadow-black/40`}
                >
                  <div className={`w-14 shrink-0 bg-gradient-to-b ${book.gradient} flex items-center justify-center`}>
                    <BookOpen className="h-5 w-5 text-white/60" />
                  </div>
                  <div className="flex-1 bg-white/3 group-hover:bg-white/5 transition-colors px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${book.accent}`}>{book.scope}</p>
                        <h3 className="text-white font-semibold text-base leading-snug mb-1 font-serif">{book.title}</h3>
                        <p className="text-xs text-white/40">{book.period}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/8">
                      <span className="text-xs text-white/30">{book.chapters} chapters</span>
                      <span className="text-white/15">·</span>
                      <span className="text-xs text-white/30">{book.pages} pages</span>
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
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-white/8 bg-white/2 text-center">
              <BookOpen className="h-10 w-10 text-white/15 mb-3" />
              <p className="text-sm text-white/35">Generate a book above — saved copies appear here.</p>
            </div>
          )}
        </div>

        {bottomSlot}
      </div>
    </div>
  );
};

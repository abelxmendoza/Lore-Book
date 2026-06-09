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

// Demo books shown in mock/demo mode
const DEMO_BOOKS = [
  {
    id: 'demo-1',
    title: 'The Creative Renaissance',
    scope: 'Full biography',
    period: '2022 – 2024',
    chapters: 5,
    pages: 48,
    gradient: 'from-purple-900 via-purple-800 to-indigo-900',
    accent: 'text-purple-300',
    border: 'border-purple-700/40',
    lastRead: '2 days ago',
  },
  {
    id: 'demo-2',
    title: 'Sarah Chen',
    scope: 'A friendship',
    period: '2018 – present',
    chapters: 3,
    pages: 24,
    gradient: 'from-rose-900 via-pink-800 to-rose-900',
    accent: 'text-pink-300',
    border: 'border-pink-700/40',
    lastRead: '1 week ago',
  },
  {
    id: 'demo-3',
    title: 'Music & Production',
    scope: 'Skill arc',
    period: '1.5 years',
    chapters: 4,
    pages: 36,
    gradient: 'from-cyan-900 via-teal-800 to-cyan-900',
    accent: 'text-cyan-300',
    border: 'border-cyan-700/40',
    lastRead: '3 days ago',
  },
  {
    id: 'demo-4',
    title: 'The Tech-to-Creative Shift',
    scope: 'Life era',
    period: '2021 – 2022',
    chapters: 2,
    pages: 18,
    gradient: 'from-amber-900 via-orange-800 to-amber-900',
    accent: 'text-amber-300',
    border: 'border-amber-700/40',
    lastRead: 'Today',
  },
];

interface LibraryLandingProps {
  onGenerate: (query: string) => void;
  onOpenDemoBook?: (bookId: string) => void;
  generating?: boolean;
  isMockData?: boolean;
  /** Slot rendered below the "Recently generated" section — e.g. saved books, recommendations. */
  bottomSlot?: React.ReactNode;
}

export const LibraryLanding = ({
  onGenerate,
  onOpenDemoBook,
  generating = false,
  isMockData = false,
  bottomSlot,
}: LibraryLandingProps) => {
  const navigate = useNavigate();
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

        {/* Edit Lore entry point */}
        <div className="mb-8 sm:mb-10">
          <button
            type="button"
            onClick={() => navigate('/memoir')}
            className="group w-full flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-primary/25 px-4 py-3.5 text-left transition-all"
          >
            <div className="shrink-0 p-2 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 opacity-80 group-hover:opacity-100 transition-opacity">
              <Edit3 className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/70 group-hover:text-white transition-colors">Edit Lore</p>
              <p className="text-xs text-white/35 mt-0.5">Browse and edit biography sections, characters, locations, and chapters with AI</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 shrink-0 transition-all" />
          </button>
        </div>

        {/* Recently generated section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-white/35 uppercase tracking-widest font-mono">Recently generated</p>
            {isMockData && <span className="text-xs text-white/25 font-mono">{DEMO_BOOKS.length} books</span>}
          </div>

          {isMockData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DEMO_BOOKS.map((book) => (
                <button
                  type="button"
                  key={book.id}
                  onClick={() => onOpenDemoBook?.(book.id)}
                  className={`group relative flex items-stretch gap-0 rounded-2xl border ${book.border} overflow-hidden text-left transition-all hover:scale-[1.015] hover:shadow-xl hover:shadow-black/40 active:scale-[0.99]`}
                >
                  <div className={`w-14 shrink-0 bg-gradient-to-b ${book.gradient} flex items-center justify-center`}>
                    <BookOpen className="h-5 w-5 text-white/60" />
                  </div>
                  <div className="flex-1 bg-white/3 group-hover:bg-white/5 transition-colors px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${book.accent}`}>{book.scope}</p>
                        <h3 className="text-white font-semibold text-base leading-snug mb-1 font-serif">{book.title}</h3>
                        <p className="text-xs text-white/40">{book.period}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 shrink-0 mt-1 transition-colors" />
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/8">
                      <span className="text-xs text-white/30">{book.chapters} chapters</span>
                      <span className="text-white/15">·</span>
                      <span className="text-xs text-white/30">{book.pages} pages</span>
                      <span className="text-white/15">·</span>
                      <span className="text-xs text-white/30">{book.lastRead}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-white/8 bg-white/2 text-center">
              <BookOpen className="h-10 w-10 text-white/15 mb-3" />
              <p className="text-sm text-white/35">No books yet — generate your first one above.</p>
            </div>
          )}
        </div>

        {bottomSlot}
      </div>
    </div>
  );
};

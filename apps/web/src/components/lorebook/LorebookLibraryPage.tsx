import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Menu, ChevronLeft, BookOpen, Edit3, Loader2, Download, Star, RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import {
  lorebookEditUrl,
  lorebookReadUrl,
} from '../../lib/lorebookLibrary';
import { DEMO_LOREBOOK_CATALOG } from '../../mocks/lorebooks';
import { resolveDemoLorebookById } from '../../lib/storyForge/forgeDemoLibrary';
import { fetchJson } from '../../lib/api';
import {
  biographyToPdfSections,
  downloadLorebookPdf,
  flattenMemoirSections,
} from '../../lib/downloadLorebookPdf';
import { cn } from '../../lib/cn';
import { useLorebookShell } from './LorebookShell';
import { LorebookLibraryHero } from './LorebookSectionTitles';
import type { Biography } from '../../../server/src/services/biographyGeneration/types';

type LibraryBook = {
  id: string;
  title: string;
  subtitle?: string;
  scope?: string;
  period?: string;
  created_at: string;
  is_core_lorebook?: boolean;
  lorebook_name?: string;
  chapterCount: number;
  pages?: number;
  gradient: string;
  accent: string;
  border: string;
  biography?: Biography;
};

const BOOK_STYLES = [
  { gradient: 'from-purple-600 to-indigo-700', accent: 'text-purple-300', border: 'border-purple-500/25' },
  { gradient: 'from-emerald-600 to-teal-700', accent: 'text-emerald-300', border: 'border-emerald-500/25' },
  { gradient: 'from-amber-600 to-orange-700', accent: 'text-amber-300', border: 'border-amber-500/25' },
  { gradient: 'from-pink-600 to-rose-700', accent: 'text-pink-300', border: 'border-pink-500/25' },
  { gradient: 'from-blue-600 to-cyan-700', accent: 'text-sky-300', border: 'border-sky-500/25' },
  { gradient: 'from-violet-600 to-purple-700', accent: 'text-violet-300', border: 'border-violet-500/25' },
] as const;

function styleForIndex(index: number) {
  return BOOK_STYLES[index % BOOK_STYLES.length];
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type LorebookLibraryPageProps = {
  onOpenAppSidebar?: () => void;
};

export const LorebookLibraryPage = ({ onOpenAppSidebar }: LorebookLibraryPageProps) => {
  const inShell = useLorebookShell();
  const navigate = useNavigate();
  const shouldUseMock = useShouldUseMockData();
  const { compiledBooks, loading: readinessLoading } = useLoreReadiness();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'core' | 'recent'>('all');
  const compiledBooksKey = useMemo(
    () => compiledBooks.map((book) => book.id).join(','),
    [compiledBooks],
  );

  const loadBooks = useCallback(async () => {
    if (shouldUseMock) {
      setBooks(
        compiledBooks.map((book, index) => {
          const catalog = DEMO_LOREBOOK_CATALOG.find((entry) => entry.id === book.id);
          const style = styleForIndex(index);
          return {
            id: book.id,
            title: book.title ?? catalog?.title ?? 'Untitled lorebook',
            scope: book.is_core_lorebook ? 'Core edition' : book.lorebook_name ?? catalog?.scope ?? 'Compiled lorebook',
            period: catalog?.period ?? formatDate(book.created_at),
            created_at: book.created_at,
            is_core_lorebook: book.is_core_lorebook,
            lorebook_name: book.lorebook_name,
            chapterCount: book.chapterCount ?? catalog?.chapters ?? 0,
            pages: catalog?.pages ?? Math.max((book.chapterCount ?? 0) * 4, book.chapterCount ?? 0),
            gradient: catalog?.gradient ?? style.gradient,
            accent: catalog?.accent ?? style.accent,
            border: catalog?.border ?? style.border,
          };
        }),
      );
      setLoadError(null);
      setLoading(readinessLoading);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchJson<{
        biographies: Array<{
          id: string;
          title: string;
          subtitle?: string;
          domain?: string;
          created_at: string;
          is_core_lorebook?: boolean;
          lorebook_name?: string;
          biography_data: Biography;
        }>;
      }>('/api/biography/list');

      const mapped = (result.biographies ?? []).map((row, index) => {
        const style = styleForIndex(index);
        const data = row.biography_data;
        const chapterCount = data?.chapters?.length ?? 0;
        return {
          id: row.id,
          title: row.lorebook_name || data?.title || row.title || 'Untitled lorebook',
          subtitle: row.subtitle || data?.subtitle,
          scope: row.is_core_lorebook ? 'Core edition' : row.domain || 'Compiled lorebook',
          period: data?.metadata?.timePeriods?.[0]
            ? `${data.metadata.timePeriods[0].label ?? 'Life span'}`
            : formatDate(row.created_at),
          created_at: row.created_at,
          is_core_lorebook: row.is_core_lorebook,
          lorebook_name: row.lorebook_name,
          chapterCount,
          pages: Math.max(chapterCount * 4, chapterCount),
          gradient: style.gradient,
          accent: style.accent,
          border: style.border,
          biography: data,
        };
      });

      setBooks(mapped);
    } catch (error) {
      console.error('Failed to load compiled lorebooks:', error);
      setLoadError('Could not load your lorebook library. Try refreshing.');
      setBooks([]);
    } finally {
      setLoading(false);
    }
    // compiledBooksKey stabilizes the effect when parent re-renders with a fresh array reference.
  }, [shouldUseMock, compiledBooksKey, readinessLoading]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const filteredBooks = useMemo(() => {
    if (filter === 'core') return books.filter((b) => b.is_core_lorebook);
    if (filter === 'recent') return [...books].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 12);
    return books;
  }, [books, filter]);

  const handleDownload = async (book: LibraryBook) => {
    if (downloadingId) return;
    setDownloadingId(book.id);
    try {
      if (shouldUseMock) {
        const demo = resolveDemoLorebookById(book.id);
        if (!demo) throw new Error('Demo book not found');
        const sections = flattenMemoirSections(demo.outline.sections ?? []);
        await downloadLorebookPdf(demo.outline.title || book.title, sections);
        return;
      }

      let biography = book.biography;
      if (!biography) {
        const result = await fetchJson<{ biography: Biography }>(`/api/biography/${book.id}`);
        biography = result.biography;
      }

      const sections = biographyToPdfSections(biography);
      await downloadLorebookPdf(biography.title || book.title, sections);
    } catch (error) {
      console.error('Failed to download lorebook:', error);
      alert('Download failed. Open the book to read first, then try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-black via-[#0d0814] to-black overflow-y-auto">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(139,92,246,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(236,72,153,0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(88,28,135,0.04),transparent_70%)]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 px-4 sm:px-8 lg:px-16 py-4 sm:py-8 max-w-6xl mx-auto w-full">
        <div className={cn('flex items-center justify-between gap-3 mb-6 sm:mb-8', inShell && 'hidden lg:flex')}>
          <div className="flex items-center gap-2 min-w-0">
            {onOpenAppSidebar && (
              <button
                type="button"
                onClick={onOpenAppSidebar}
                className="p-2.5 rounded-lg active:bg-white/10 lg:hidden shrink-0"
                aria-label="Open app menu"
              >
                <Menu className="h-5 w-5 text-white/50" />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/lorebook')}
              className="flex items-center gap-0.5 px-2 py-2 rounded-lg text-sm font-mono text-white/50 active:bg-white/10 hover:text-white/70 transition-colors shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to generate</span>
              <span className="sm:hidden">Back</span>
            </button>
          </div>

          {!shouldUseMock && (
            <button
              type="button"
              onClick={() => void loadBooks()}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors shrink-0"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          )}
        </div>

        <LorebookLibraryHero
          variant="emerald"
          subtitle="Every compiled lorebook in one place — read, refine, or download as PDF."
          className="mb-6 sm:mb-8"
        />

        {!shouldUseMock && books.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6 sm:mb-8">
            {(['all', 'recent', 'core'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors',
                  filter === key
                    ? 'border-primary/50 bg-primary/15 text-white'
                    : 'border-white/10 bg-white/3 text-white/45 hover:text-white/70 hover:border-white/20'
                )}
              >
                {key === 'all' ? `All (${books.length})` : key === 'recent' ? 'Recent' : 'Core editions'}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
            <p className="text-sm text-white/40 font-mono">Loading your library…</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-red-500/20 bg-red-500/5 text-center px-6">
            <p className="text-sm text-red-300/90 mb-4">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadBooks()}
              className="text-sm text-primary hover:text-primary/80 font-medium"
            >
              Try again
            </button>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-white/8 bg-white/2 text-center px-6">
            <BookOpen className="h-14 w-14 text-white/15 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">No compiled lorebooks yet</h2>
            <p className="text-sm text-white/45 max-w-sm mb-5">
              Generate a lorebook from your memories, then return here to read, edit, and download.
            </p>
            <button
              type="button"
              onClick={() => navigate('/lorebook')}
              className="rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-sm font-medium px-5 py-2.5 transition-colors"
            >
              Go generate a lorebook
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 pb-8">
            {filteredBooks.map((book) => (
              <article
                key={book.id}
                className={cn(
                  'group relative flex flex-col rounded-2xl border overflow-hidden text-left transition-all hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5',
                  book.border
                )}
              >
                <div className={cn('h-2 w-full bg-gradient-to-r shrink-0', book.gradient)} />
                <div className="flex flex-1 flex-col bg-white/3 group-hover:bg-white/5 transition-colors p-4 sm:p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn('rounded-xl p-2.5 bg-gradient-to-br shrink-0', book.gradient)}>
                      <BookOpen className="h-4 w-4 text-white/80" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[10px] font-mono uppercase tracking-wider mb-1', book.accent)}>
                        {book.scope}
                      </p>
                      <h2 className="text-white font-semibold text-base leading-snug font-serif line-clamp-2">
                        {book.title}
                      </h2>
                      {book.subtitle && (
                        <p className="text-xs text-white/45 mt-1 line-clamp-2">{book.subtitle}</p>
                      )}
                    </div>
                    {book.is_core_lorebook && (
                      <Star className="h-4 w-4 text-amber-400/80 shrink-0" aria-label="Core lorebook" />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/35 font-mono mb-4">
                    <span>{book.chapterCount} chapters</span>
                    {book.pages != null && (
                      <>
                        <span className="text-white/15">·</span>
                        <span>~{book.pages} pages</span>
                      </>
                    )}
                    <span className="text-white/15">·</span>
                    <span>{book.period || formatDate(book.created_at)}</span>
                  </div>

                  <div className="mt-auto grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(lorebookReadUrl(book.id))}
                      className="rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-medium py-2.5 transition-colors"
                    >
                      Read
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(lorebookEditUrl(book.id))}
                      className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 hover:text-white text-xs font-medium py-2.5 transition-colors inline-flex items-center justify-center gap-1"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(book)}
                      disabled={downloadingId === book.id}
                      className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-xs font-medium py-2.5 transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {downloadingId === book.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      PDF
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

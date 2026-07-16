import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Sparkles, Users, Compass, Clock, BookMarked, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchLivingBiographyCard, type LivingBiographyCard as LivingBiographyCardData } from '../../api/livingBiography';
import { cn } from '../../lib/cn';
import { apiCache } from '../../lib/cache';
import { lorebookEditorUrlForCompiledBooks } from '../../lib/lorebookLibrary';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';

const BIOGRAPHY_CACHE_PATTERN = /\/api\/biography\/living(?:\?|:|$)/;
const BIOGRAPHY_REFRESH_MS = 60_000;

function formatLastUpdated(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'Live · updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export const LivingBiographyCard = () => {
  const [card, setCard] = useState<LivingBiographyCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { compiledBooks } = useLoreReadiness();
  const editorUrl = lorebookEditorUrlForCompiledBooks(compiledBooks);

  const loadCard = useCallback((force = false) => {
    if (force) apiCache.deletePattern(BIOGRAPHY_CACHE_PATTERN);
    return fetchLivingBiographyCard()
      .then(data => setCard(data.card))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useVisiblePolling(
    () => { void loadCard(true); },
    BIOGRAPHY_REFRESH_MS,
    { immediate: true, runOnVisible: true },
  );

  useEffect(() => {
    const onFocus = () => { void loadCard(true); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadCard]);

  if (loading) {
    return (
      <div
        className="w-full rounded-2xl border border-white/8 bg-gradient-to-br from-cyan-500/5 via-black/40 to-violet-500/5 p-5 animate-pulse"
        aria-hidden
      >
        <div className="h-3 w-36 rounded bg-white/10 mb-4" />
        <div className="h-6 w-2/3 rounded bg-white/10 mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-16 rounded-xl bg-white/5" />
          <div className="h-16 rounded-xl bg-white/5" />
          <div className="h-16 rounded-xl bg-white/5" />
        </div>
      </div>
    );
  }

  if (!card || !card.hasEnoughData) return null;

  // Bridge: send a Living Biography chapter/person straight into lorebook
  // generation via the `focus` query param LoreBook already listens for.
  const generateLorebook = (e: React.MouseEvent, query: string) => {
    e.stopPropagation();
    navigate(`/lorebook?focus=${encodeURIComponent(query)}`);
  };

  const focusItems = card.currentFocus.length > 0 ? card.currentFocus : card.recentDevelopments;
  const focusLabel = card.currentFocus.length > 0 ? 'Current focus' : 'Recent developments';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(editorUrl)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(editorUrl); }}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border border-cyan-500/20',
        'bg-gradient-to-br from-cyan-500/[0.08] via-black/50 to-violet-500/[0.06] p-5 text-left cursor-pointer',
        'transition-all duration-300 hover:border-cyan-400/35 hover:shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)]',
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(34,211,238,0.12), transparent 55%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(139,92,246,0.1), transparent 50%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-cyan-500/15 p-1.5 border border-cyan-400/20">
              <BookOpen className="h-4 w-4 text-cyan-300" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Your Story Right Now
            </span>
          </div>
          {card.lastUpdated && (
            <span className="flex items-center gap-1 text-[11px] text-white/35">
              <Clock className="h-3 w-3" />
              {formatLastUpdated(card.lastUpdated)}
            </span>
          )}
        </div>

        {card.currentChapter && (
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Current chapter</p>
              <p className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-violet-200">
                  {card.currentChapter.label}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => generateLorebook(e, `the story of ${card.currentChapter!.label}`)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-cyan-200/80 border border-cyan-500/25 hover:border-cyan-400/50 hover:text-cyan-100 hover:bg-cyan-500/10 transition-colors shrink-0"
            >
              <BookMarked className="h-3 w-3" />
              Generate Lorebook
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {card.topThemes.length > 0 && (
            <div className="rounded-xl border border-white/6 bg-black/25 p-3.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-300/90" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">Strongest themes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.topThemes.map((theme) => (
                  <span
                    key={theme}
                    className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100/90"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {card.keyPeople.length > 0 && (
            <div className="rounded-xl border border-white/6 bg-black/25 p-3.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Users className="h-3.5 w-3.5 text-rose-300/90" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">People who matter</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.keyPeople.map((p, index) => (
                  <button
                    key={`${p.name}-${p.relationship}-${index}`}
                    type="button"
                    onClick={(e) => generateLorebook(e, `my story with ${p.name}`)}
                    title={`Generate a lorebook about ${p.name}`}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-100/90 hover:border-rose-400/40 hover:bg-rose-500/20 transition-colors"
                  >
                    {p.name}
                    <ArrowUpRight className="h-3 w-3 opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {focusItems.length > 0 && (
            <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.06] p-3.5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Compass className="h-3.5 w-3.5 text-cyan-300" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">{focusLabel}</span>
              </div>
              <ul className="space-y-1.5">
                {focusItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/85 leading-snug">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

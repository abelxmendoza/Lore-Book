import { useEffect, useState } from 'react';
import { BookOpen, Sparkles, Users, Compass, Clock, BookMarked } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchLivingBiographyCard, type LivingBiographyCard as LivingBiographyCardData } from '../../api/livingBiography';
import { cn } from '../../lib/cn';

function formatLastUpdated(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export const LivingBiographyCard = () => {
  const [card, setCard] = useState<LivingBiographyCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLivingBiographyCard()
      .then(data => setCard(data.card))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !card || !card.hasEnoughData) return null;

  // Bridge: send a Living Biography chapter/person straight into lorebook
  // generation via the `focus` query param LoreBook already listens for.
  const generateLorebook = (e: React.MouseEvent, query: string) => {
    e.stopPropagation();
    navigate(`/lorebook?focus=${encodeURIComponent(query)}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/memoir')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/memoir'); }}
      className={cn(
        'group w-full rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-black/30 to-pink-500/5 p-5 text-left cursor-pointer',
        'transition-all duration-200 hover:border-purple-500/40 hover:from-purple-500/15',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Your Story Right Now</span>
        </div>
        {card.lastUpdated && (
          <span className="flex items-center gap-1 text-xs text-white/30">
            <Clock className="h-3 w-3" />
            {formatLastUpdated(card.lastUpdated)}
          </span>
        )}
      </div>

      {card.currentChapter && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-lg font-semibold text-white">
            Current chapter: <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{card.currentChapter.label}</span>
          </p>
          <button
            type="button"
            onClick={(e) => generateLorebook(e, `the story of ${card.currentChapter!.label}`)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-purple-300/80 border border-purple-500/20 hover:border-purple-500/40 hover:text-purple-200 hover:bg-purple-500/10 transition-colors shrink-0"
          >
            <BookMarked className="h-3 w-3" />
            Generate Lorebook
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {card.topThemes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium text-white/40">Strongest themes</span>
            </div>
            <p className="text-sm text-white/80">{card.topThemes.join(', ')}</p>
          </div>
        )}

        {card.keyPeople.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="h-3.5 w-3.5 text-pink-400" />
              <span className="text-xs font-medium text-white/40">People who matter most</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {card.keyPeople.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={(e) => generateLorebook(e, `my story with ${p.name}`)}
                  title={`Generate a lorebook about ${p.name}`}
                  className="text-sm text-white/80 hover:text-pink-300 underline decoration-dotted decoration-white/20 hover:decoration-pink-400/50 underline-offset-2 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {(card.currentFocus.length > 0 || card.recentDevelopments.length > 0) && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Compass className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-medium text-white/40">
                {card.currentFocus.length > 0 ? 'Current focus' : 'Recent developments'}
              </span>
            </div>
            <p className="text-sm text-white/80">
              {(card.currentFocus.length > 0 ? card.currentFocus : card.recentDevelopments).join(' · ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

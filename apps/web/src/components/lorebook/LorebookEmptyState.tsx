import { useEffect, useState } from 'react';
import { BookOpen, Sparkles, Users, Compass, Loader2 } from 'lucide-react';
import { fetchLivingBiographyCard, type LivingBiographyCard } from '../../api/livingBiography';
import { useEntityCounts } from '../../hooks/useEntityCounts';
import { LorebookRecommendations } from './LorebookRecommendations';
import { cn } from '../../lib/cn';

type LorebookEmptyStateProps = {
  reason: 'no-story' | 'generation-failed';
  message?: string | null;
  onGenerateFromSpec: (spec: any, type?: string) => void;
};

const HEADLINES: Record<LorebookEmptyStateProps['reason'], { title: string; body: string }> = {
  'no-story': {
    title: "There's not quite enough story yet",
    body: "LoreBook compiles books from what it already knows about you — keep talking and journaling, and a book will form on its own. In the meantime, here's what it has so far.",
  },
  'generation-failed': {
    title: "That book couldn't be compiled",
    body: "There wasn't enough material for that specific request yet. Here's what LoreBook currently knows — try one of these instead.",
  },
};

/**
 * Shown whenever there isn't enough material to render a book — either on
 * first load (no main lifestory yet) or after a failed generation ("No
 * atoms found matching specification"). Replaces the dead-end placeholder
 * with a factual look at what LoreBook already knows, plus suggested books
 * it could compile right now.
 *
 * Pure projection: reuses the Living Biography card and the existing
 * lorebook recommendation engine — no new intelligence, no new fetches
 * beyond what those surfaces already expose.
 */
export const LorebookEmptyState = ({ reason, message, onGenerateFromSpec }: LorebookEmptyStateProps) => {
  const [card, setCard] = useState<LivingBiographyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const counts = useEntityCounts();
  const headline = HEADLINES[reason];

  useEffect(() => {
    fetchLivingBiographyCard()
      .then(data => setCard(data.card))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-black via-[#0d0814] to-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10 sm:py-16 space-y-8">

        <div className="text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-primary/40" />
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            {headline.title}
          </h2>
          <p className="text-white/50 text-sm sm:text-base max-w-lg mx-auto">{headline.body}</p>
          {message && (
            <p className="text-xs text-white/30 mt-2 font-mono">{message}</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          </div>
        ) : card?.hasEnoughData ? (
          <div className="rounded-2xl border border-white/10 bg-white/3 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">What LoreBook knows so far</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {card.topThemes.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-medium text-white/40">Themes</span>
                  </div>
                  <p className="text-sm text-white/80">{card.topThemes.join(', ')}</p>
                </div>
              )}
              {card.keyPeople.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Users className="h-3.5 w-3.5 text-pink-400" />
                    <span className="text-xs font-medium text-white/40">People</span>
                  </div>
                  <p className="text-sm text-white/80">{card.keyPeople.map(p => p.name).join(', ')}</p>
                </div>
              )}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Compass className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs font-medium text-white/40">Timeline coverage</span>
                </div>
                <p className="text-sm text-white/80">
                  {counts ? `${counts.characters ?? 0} people · ${counts.locations ?? 0} places · ${counts.events ?? 0} events` : '…'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(
            'rounded-2xl border border-white/8 bg-white/2 text-center py-8 px-4',
          )}>
            <p className="text-sm text-white/35">
              Keep talking with LoreBook — the more it learns, the sooner a book takes shape.
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest font-mono mb-3">Suggested next lorebooks</p>
          <LorebookRecommendations onGenerate={onGenerateFromSpec} />
        </div>
      </div>
    </div>
  );
};

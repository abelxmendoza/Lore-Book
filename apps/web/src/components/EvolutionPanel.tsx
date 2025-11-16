import { Flame, RefreshCw, Sparkles } from 'lucide-react';

import type { EvolutionInsights } from '../hooks/useLoreKeeper';
import { Button } from './ui/button';

type Props = {
  insights: EvolutionInsights | null;
  loading?: boolean;
  onRefresh?: () => void;
};

const Pill = ({ label }: { label: string }) => (
  <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
    {label}
  </span>
);

export const EvolutionPanel = ({ insights, loading, onRefresh }: Props) => {
  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-purple-950/40 via-black to-black p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Flame className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <p className="text-xs uppercase text-white/50">Evolving Persona</p>
            <h3 className="text-lg font-semibold text-white">{insights?.personaTitle ?? 'The Archivist'}</h3>
          </div>
        </div>
        {onRefresh && (
          <Button size="sm" variant="ghost" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
        )}
      </div>

      <p className="mt-3 text-sm text-white/70">{insights?.toneShift ?? 'Keep journaling to teach your Archivist your tone.'}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(insights?.personaTraits ?? ['Observant', 'Grounded']).map((trait) => (
          <Pill key={trait} label={trait} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-black/50 p-3">
          <div className="flex items-center gap-2 text-xs uppercase text-white/50">
            <Sparkles className="h-4 w-4 text-primary" /> Tone & Emotion
          </div>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {(insights?.emotionalPatterns ?? ['Awaiting patterns…']).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border/50 bg-black/50 p-3">
          <div className="flex items-center gap-2 text-xs uppercase text-white/50">
            <Sparkles className="h-4 w-4 text-primary" /> Tag Trends
          </div>
          <div className="mt-2 space-y-2 text-xs text-white/70">
            <p><span className="text-primary">Top:</span> {(insights?.tagTrends.top || ['n/a']).join(', ')}</p>
            <p><span className="text-primary">Rising:</span> {(insights?.tagTrends.rising || ['—']).join(', ')}</p>
            <p><span className="text-primary">Fading:</span> {(insights?.tagTrends.fading || ['—']).join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <p className="text-xs uppercase text-white/50">Echoes</p>
          <div className="mt-2 space-y-2 text-sm text-white/70">
            {(insights?.echoes?.length ? insights.echoes : [{ title: 'Awaiting echoes', referenceDate: '' }]).map((echo) => (
              <div key={`${echo.title}-${echo.referenceDate}`} className="rounded-lg border border-border/50 bg-black/40 p-3">
                <p className="font-medium text-white">{echo.title}</p>
                {echo.referenceDate && <p className="text-xs text-white/40">{echo.referenceDate}</p>}
                {echo.quote && <p className="mt-1 text-white/60">“{echo.quote}”</p>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase text-white/50">Reminders</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {(insights?.reminders ?? ['Keep logging your lore.']).map((reminder) => (
              <li key={reminder}>• {reminder}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-white/80">
          <p className="text-xs uppercase text-primary/70">Next Era</p>
          <p className="mt-1 text-white">{insights?.nextEra ?? 'Name your next chapter and keep writing.'}</p>
        </div>
      </div>
    </div>
  );
};

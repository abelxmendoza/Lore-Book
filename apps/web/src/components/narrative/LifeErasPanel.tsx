import { useEffect, useState } from 'react';
import { Landmark, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { lifeErasApi, type LifeEraRecord } from '../../api/lifeEras';
import { cn } from '../../lib/cn';

function formatRange(start: string | null, end: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (!start && !end) return 'Undated';
  if (start && end && start.slice(0, 7) !== end.slice(0, 7)) {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  return fmt(start ?? end!);
}

function EraCard({
  era,
  selected,
  defaultOpen,
  onSelect,
}: {
  era: LifeEraRecord;
  selected?: boolean;
  defaultOpen?: boolean;
  onSelect?: (era: LifeEraRecord) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-colors',
        selected
          ? 'border-sky-400/40 bg-sky-500/10'
          : 'border-white/10 bg-white/[0.03]',
      )}
      data-testid={`life-era-${era.id}`}
    >
      <button
        type="button"
        onClick={() => {
          onSelect?.(era);
          setOpen((v) => !v);
        }}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-500/10 text-sky-200/90 font-medium">
              Life era
            </span>
            {era.is_current && (
              <span className="text-[10px] text-emerald-400/80">● current</span>
            )}
            <span className="text-[10px] text-white/35 font-mono">
              {formatRange(era.time_start, era.time_end)}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90">{era.title}</p>
          <p className="text-xs text-white/50 mt-1 line-clamp-2">{era.thesis || era.summary}</p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/35">
            <span>
              {era.chapter_ids.length} chapter{era.chapter_ids.length !== 1 ? 's' : ''}
            </span>
            {era.scene_ids.length > 0 && (
              <span>· {era.scene_ids.length} scenes</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-white/30 mt-1 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/8">
          {era.summary && (
            <p className="text-xs text-white/60 pt-2 leading-relaxed">{era.summary}</p>
          )}
          {era.themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {era.themes.map((theme) => (
                <span
                  key={theme}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/45"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type LifeErasPanelProps = {
  compact?: boolean;
  selectedId?: string | null;
  onSelectEra?: (era: LifeEraRecord) => void;
  /** Bump to reload eras after story-chapter rebuild. */
  refreshKey?: number;
};

export function LifeErasPanel({
  compact = false,
  selectedId = null,
  onSelectEra,
  refreshKey = 0,
}: LifeErasPanelProps) {
  const [eras, setEras] = useState<LifeEraRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    lifeErasApi
      .list({ limit: 50 })
      .then((res) => {
        if (res.success) setEras(res.eras);
      })
      .catch(() => setError('Life eras not available yet.'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-sky-300/70 text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading life eras…
        </div>
      </div>
    );
  }

  if (error || eras.length === 0) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <AlertCircle className="h-3.5 w-3.5" />
          {error ?? 'Eras appear as Story Chapters span months of life.'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('rounded-xl border border-sky-500/20 bg-sky-950/10', compact ? 'p-3' : 'p-4')}
      data-testid="life-eras-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="h-4 w-4 text-sky-400" />
        <span className="text-sm font-semibold text-white/85">Life eras</span>
        <span className="text-[10px] text-white/35 ml-auto">{eras.length} from chapters</span>
      </div>
      <div className="space-y-2">
        {[...eras].reverse().map((era, i) => (
          <EraCard
            key={era.id}
            era={era}
            selected={era.id === selectedId}
            defaultOpen={i === 0}
            onSelect={onSelectEra}
          />
        ))}
      </div>
    </div>
  );
}

export function LifeEraReader({
  era,
  onBack,
}: {
  era: LifeEraRecord;
  onBack?: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto" data-testid="life-era-reader">
      <div className="sticky top-0 z-10 border-b border-white/8 bg-black/90 backdrop-blur-sm px-4 py-3 flex items-start gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="md:hidden text-white/50 text-sm mt-1">
            Back
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-sky-300/70 uppercase tracking-widest font-mono mb-1">
            Life era{era.is_current ? ' · current' : ''}
          </p>
          <h2 className="text-lg font-semibold text-white/95">{era.title}</h2>
          <p className="text-xs text-white/40 mt-1 font-mono">
            {formatRange(era.time_start, era.time_end)}
          </p>
        </div>
      </div>
      <div className="px-4 sm:px-8 py-6 max-w-2xl space-y-5">
        {era.thesis && (
          <p className="text-base text-white/80 leading-relaxed italic">{era.thesis}</p>
        )}
        <p className="text-sm text-white/65 leading-relaxed">{era.summary}</p>
        <div className="flex flex-wrap gap-3 text-xs text-white/40">
          <span>{era.chapter_ids.length} chapters</span>
          <span>{era.scene_ids.length} scenes</span>
          <span>{era.event_ids.length} events</span>
          <span>significance {era.significance_score}</span>
          {era.location && <span>@ {era.location}</span>}
        </div>
        {era.themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {era.themes.map((theme) => (
              <span
                key={theme}
                className="text-[11px] px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-white/50"
              >
                {theme}
              </span>
            ))}
          </div>
        )}
        {era.participants.length > 0 && (
          <p className="text-sm text-white/50">
            With{' '}
            {era.participants
              .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
              .join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

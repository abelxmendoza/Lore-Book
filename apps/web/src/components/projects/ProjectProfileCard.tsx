import { Briefcase, CalendarClock, ChevronRight } from 'lucide-react';

export type ProjectCardData = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  description: string | null;
  summary?: string | null;
  tags: string[] | null;
  started_at?: string | null;
  ended_at?: string | null;
  importance_score?: number | null;
  updated_at: string;
  metadata?: { source?: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  abandoned: 'bg-white/10 text-white/40 border-white/15',
};

const STATUS_SHORT: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Done',
  abandoned: 'Left',
};

type Props = {
  project: ProjectCardData;
  selected?: boolean;
  selectionMode?: boolean;
  onClick: () => void;
};

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ProjectProfileCard({ project, selected, selectionMode, onClick }: Props) {
  const status = project.status ?? 'active';
  const isFallback = project.metadata?.source === 'organizations_fallback';
  const typeLabel = project.type?.replace(/_/g, ' ') ?? null;
  const shortDate = formatShortDate(project.updated_at);
  const statusLabel = STATUS_SHORT[status] ?? status;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full h-full min-h-0 text-left rounded-xl border bg-black/40 transition-all duration-200 overflow-hidden aspect-[4/5] sm:aspect-auto flex flex-col touch-manipulation active:scale-[0.99] hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${
        selected
          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
          : 'border-white/10 hover:bg-primary/5'
      }`}
    >
      {selectionMode && (
        <span
          className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 w-5 h-5 rounded border text-[10px] flex items-center justify-center ${
            selected ? 'bg-primary border-primary/80 text-white' : 'border-white/25 text-transparent bg-black/40'
          }`}
        >
          ✓
        </span>
      )}

      {/* Mobile — compact square tile */}
      <div className="sm:hidden flex flex-col h-full min-h-0">
        <div className="h-9 shrink-0 flex items-center justify-between gap-1 px-2.5 border-b border-white/8 bg-primary/10">
          <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
          <span
            className={`text-[8px] font-medium uppercase tracking-wide rounded-full border px-1.5 py-0.5 truncate max-w-[58%] ${
              STATUS_STYLE[status] ?? STATUS_STYLE.active
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex-1 min-h-0 p-2.5 flex flex-col gap-1 overflow-hidden">
          <h3 className="text-xs font-semibold text-white leading-tight line-clamp-2 break-words pr-4">
            {project.name}
          </h3>
          {typeLabel && (
            <span className="text-[9px] uppercase tracking-wide text-white/40 truncate">{typeLabel}</span>
          )}
          {project.description ? (
            <p className="text-[11px] text-white/55 line-clamp-3 leading-snug mt-0.5">{project.description}</p>
          ) : (
            <p className="text-[10px] text-white/25 italic mt-0.5">No description</p>
          )}

          <div className="mt-auto pt-1.5 flex items-end justify-between gap-1 min-w-0 border-t border-white/5">
            {project.tags?.[0] ? (
              <span className="text-[8px] rounded-full bg-white/5 text-white/45 px-1.5 py-0.5 truncate max-w-[55%]">
                {project.tags[0]}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <span className="text-[8px] text-white/35 flex items-center gap-0.5 shrink-0 whitespace-nowrap">
              <CalendarClock className="h-2.5 w-2.5" aria-hidden />
              {shortDate}
            </span>
          </div>
        </div>

        {(isFallback || selectionMode) && (
          <div className="shrink-0 px-2 pb-1.5">
            {isFallback && (
              <p className="text-[8px] text-amber-400/80 truncate">Communities graph</p>
            )}
            {selectionMode && !selected && (
              <p className="text-[8px] text-primary/70">Tap to select</p>
            )}
          </div>
        )}
      </div>

      {/* Desktop — full card */}
      <div className="hidden sm:flex flex-col flex-1 min-h-0 p-3 lg:p-4 gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/25 shrink-0">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-primary transition-colors break-words">
                {project.name}
              </h3>
              <span
                className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 ${
                  STATUS_STYLE[status] ?? STATUS_STYLE.active
                }`}
              >
                {status}
              </span>
            </div>
            {typeLabel && (
              <span className="text-[10px] uppercase tracking-wide text-white/40 mt-0.5 block truncate">
                {typeLabel}
              </span>
            )}
          </div>
          {!selectionMode && (
            <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
          )}
        </div>

        {project.description ? (
          <p className="text-xs lg:text-sm text-white/55 line-clamp-3 lg:line-clamp-4 leading-relaxed flex-1">{project.description}</p>
        ) : (
          <p className="text-xs text-white/30 italic">No description yet</p>
        )}

        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-white/5 min-w-0">
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {project.tags?.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] rounded-full bg-white/5 text-white/50 px-2 py-0.5 truncate max-w-full">
                {t}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-white/35 flex items-center gap-1 shrink-0 whitespace-nowrap">
            <CalendarClock className="h-3 w-3" aria-hidden />
            {shortDate}
          </span>
        </div>

        {isFallback && (
          <p className="text-[10px] text-amber-400/70 leading-snug">From communities — save as project to edit</p>
        )}
        {selectionMode && (
          <p className="text-[10px] text-primary/80">{selected ? 'Selected for merge' : 'Click to select'}</p>
        )}
      </div>
    </button>
  );
}

import { Briefcase, CalendarClock } from 'lucide-react';

export type ProjectCardData = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  description: string | null;
  tags: string[] | null;
  started_at?: string | null;
  updated_at: string;
  metadata?: { source?: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  completed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  abandoned: 'bg-white/10 text-white/40 border-white/15',
};

type Props = {
  project: ProjectCardData;
  selected?: boolean;
  selectionMode?: boolean;
  onClick: () => void;
};

export function ProjectProfileCard({ project, selected, selectionMode, onClick }: Props) {
  const status = project.status ?? 'active';
  const isFallback = project.metadata?.source === 'organizations_fallback';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-2xl border p-4 transition-all duration-200 hover:border-primary/50 hover:shadow-[0_0_24px_rgba(139,92,246,0.12)] ${
        selected ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-white/10 bg-gradient-to-br from-white/[0.04] to-black/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/25 shrink-0">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-white font-semibold truncate block">{project.name}</span>
            {project.type && (
              <span className="text-[10px] uppercase tracking-wide text-white/35">{project.type.replace(/_/g, ' ')}</span>
            )}
          </div>
        </div>
        <span className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 ${STATUS_STYLE[status] ?? STATUS_STYLE.active}`}>
          {status}
        </span>
      </div>

      {project.description ? (
        <p className="text-sm text-white/55 line-clamp-3 leading-relaxed">{project.description}</p>
      ) : (
        <p className="text-sm text-white/30 italic">No description yet</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
        <div className="flex flex-wrap gap-1">
          {project.tags?.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] rounded-full bg-white/5 text-white/50 px-2 py-0.5">{t}</span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-white/35">
          <CalendarClock className="h-3 w-3" />
          {new Date(project.updated_at).toLocaleDateString()}
        </div>
      </div>

      {isFallback && (
        <p className="text-[10px] text-amber-400/70 mt-2">From communities — save as project to edit</p>
      )}
      {selectionMode && (
        <p className="text-[10px] text-primary/80 mt-2">{selected ? 'Selected for merge' : 'Tap to select'}</p>
      )}
    </button>
  );
}

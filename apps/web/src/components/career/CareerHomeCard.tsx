import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, FileText, Upload } from 'lucide-react';
import { fetchCareerSummary, type CareerSummary } from '../../api/career';
import { cn } from '../../lib/cn';

export function CareerHomeCard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<CareerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCareerSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!summary?.hasResumeData) {
    return (
      <button
        type="button"
        onClick={() => navigate('/documents')}
        className={cn(
          'w-full rounded-2xl border border-dashed border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-black/20 p-5 text-left',
          'transition-all hover:border-amber-500/50 hover:from-amber-500/10'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/15 p-2">
            <Upload className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300/70">Career lore</p>
            <p className="mt-1 text-sm font-medium text-white">Upload your resume</p>
            <p className="mt-0.5 text-xs text-white/45">
              Seed job history, skills, schools, and timeline entries in one step.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/25 shrink-0 mt-1" />
        </div>
      </button>
    );
  }

  const role = summary.currentRole;
  const topJobs = summary.employment.slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => navigate('/documents')}
      className={cn(
        'group w-full rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/8 via-black/25 to-orange-500/5 p-5 text-left',
        'transition-all hover:border-amber-500/40'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Career</span>
        </div>
        {summary.stats.unverifiedClaims > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            {summary.stats.unverifiedClaims} to review
          </span>
        )}
      </div>

      {role && (
        <p className="text-lg font-semibold text-white group-hover:text-amber-100 transition-colors">
          {role.title}
          <span className="text-white/50 font-normal"> at </span>
          {role.company}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
        <span>{summary.stats.jobCount} jobs</span>
        <span>·</span>
        <span>{summary.stats.skillCount} skills</span>
        {summary.stats.timelineEventCount > 0 && (
          <>
            <span>·</span>
            <span>{summary.stats.timelineEventCount} timeline events</span>
          </>
        )}
      </div>

      {topJobs.length > 1 && (
        <ul className="mt-3 space-y-1 border-t border-white/8 pt-3">
          {topJobs.slice(role ? 1 : 0, 3).map((job, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-white/55 truncate">
              <FileText className="h-3 w-3 shrink-0 text-amber-400/60" />
              {job.title} · {job.company}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-amber-400/70 flex items-center gap-1">
        View documents & claims <ChevronRight className="h-3 w-3" />
      </p>
    </button>
  );
}

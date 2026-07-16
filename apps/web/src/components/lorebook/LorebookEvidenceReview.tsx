/**
 * Pre-compile evidence review — shows what LoreBook will use before prose generation.
 * Matches docs/biography-experience.md Step 2 (minimal viable).
 */

import { AlertTriangle, CheckCircle2, FileText, Layers, MessageSquare } from 'lucide-react';
import type { LoreReadinessEvaluation } from '../../lib/loreReadiness';
import { READINESS_COLORS, READINESS_LABELS } from '../../lib/loreReadiness';
import { cn } from '../../lib/cn';

type LorebookEvidenceReviewProps = {
  evaluation: LoreReadinessEvaluation;
  query: string;
  loading?: boolean;
  onConfirmCompile: (force?: boolean) => void;
  onCancel: () => void;
  compiling?: boolean;
};

export function LorebookEvidenceReview({
  evaluation,
  query,
  loading = false,
  onConfirmCompile,
  onCancel,
  compiling = false,
}: LorebookEvidenceReviewProps) {
  const canForce = !evaluation.canGenerate && evaluation.progress >= 0.45;
  const blocked = !evaluation.canGenerate && !canForce;

  return (
    <div
      data-testid="lorebook-evidence-review"
      className="rounded-2xl border border-white/12 bg-black/50 p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
            Evidence review
          </p>
          <h3 className="text-base font-semibold text-white font-serif leading-snug">
            What LoreBook will use
          </h3>
          <p className="text-xs text-white/50 mt-1 line-clamp-2">
            For: <span className="text-white/75 italic">“{query}”</span>
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide',
            READINESS_COLORS[evaluation.level],
          )}
        >
          {READINESS_LABELS[evaluation.level]}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-white/40">Evaluating your record…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <EvidenceStat icon={Layers} label="Memory atoms" value={String(evaluation.atomCount)} />
            <EvidenceStat icon={FileText} label="Entries" value={String(evaluation.entryCount)} />
            <EvidenceStat icon={MessageSquare} label="Words" value={String(evaluation.wordCount)} />
            <EvidenceStat
              icon={CheckCircle2}
              label="Est. pages"
              value={`~${evaluation.estimatedPages}`}
            />
          </div>

          {evaluation.gaps.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-amber-200/90 text-xs font-medium mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Gaps before a fuller book
              </div>
              <ul className="space-y-1">
                {evaluation.gaps.slice(0, 4).map((gap) => (
                  <li key={gap.id} className="text-[11px] text-white/55 leading-relaxed">
                    {gap.label}
                    {gap.suggestion ? ` — ${gap.suggestion}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.suggestions[0] && (
            <p className="text-xs text-white/45 leading-relaxed">{evaluation.suggestions[0]}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={blocked || compiling}
              onClick={() => onConfirmCompile(false)}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors touch-manipulation',
                evaluation.canGenerate
                  ? 'bg-primary/25 border border-primary/40 text-primary hover:bg-primary/35'
                  : 'bg-white/5 border border-white/15 text-white/35 cursor-not-allowed',
              )}
            >
              {compiling ? 'Compiling…' : 'Compile this book'}
            </button>
            {canForce && (
              <button
                type="button"
                disabled={compiling}
                onClick={() => onConfirmCompile(true)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium border border-amber-500/30 bg-amber-500/10 text-amber-100/90 hover:bg-amber-500/15 transition-colors touch-manipulation disabled:opacity-50"
              >
                Compile thinner version
              </button>
            )}
            <button
              type="button"
              disabled={compiling}
              onClick={onCancel}
              className="rounded-xl px-3 py-2.5 text-sm text-white/45 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EvidenceStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-white/35 mb-1">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] font-mono uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white/85 tabular-nums">{value}</p>
    </div>
  );
}

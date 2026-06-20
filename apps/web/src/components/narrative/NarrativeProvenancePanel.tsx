import { useEffect, useState } from 'react';
import { GitBranch, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import {
  narrativeProvenanceApi,
  type NarrativeClaimKind,
  type NarrativeClaimRelation,
  type NarrativeProvenanceReport,
  type NarrativeSourceTable,
} from '../../api/narrativeProvenance';
import { cn } from '../../lib/cn';

const KIND_LABELS: Record<NarrativeClaimKind, string> = {
  fact: 'Fact',
  event: 'Event',
  evidence: 'Evidence',
  interpretation: 'Interpretation',
  meaning: 'Meaning',
};

const KIND_COLORS: Record<NarrativeClaimKind, string> = {
  fact: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  event: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  evidence: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  interpretation: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  meaning: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
};

const RELATION_LABELS: Record<NarrativeClaimRelation | 'root', string> = {
  root: 'Claim',
  evidences: 'Supported by',
  interpreted_as: 'Interpreted as',
  means_for: 'Means for',
  derived_from: 'Derived from',
  contradicts: 'Contradicts',
  supersedes: 'Supersedes',
  caused: 'Caused by',
  led_to: 'Led to',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type NarrativeProvenancePanelProps = {
  claimId?: string;
  sourceTable?: NarrativeSourceTable;
  sourceId?: string;
  compact?: boolean;
  defaultExpanded?: boolean;
  title?: string;
};

export function NarrativeProvenancePanel({
  claimId,
  sourceTable,
  sourceId,
  compact = false,
  defaultExpanded = true,
  title = 'Narrative provenance',
}: NarrativeProvenancePanelProps) {
  const [report, setReport] = useState<NarrativeProvenanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);

    const load = claimId
      ? narrativeProvenanceApi.getByClaimId(claimId)
      : sourceTable && sourceId
        ? narrativeProvenanceApi.lookupBySource(sourceTable, sourceId)
        : Promise.reject(new Error('Missing provenance lookup parameters'));

    load
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setError('No narrative chain available yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [claimId, sourceTable, sourceId]);

  const header = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full flex items-center justify-between gap-2 text-left group"
      aria-expanded={expanded}
    >
      <div className="flex items-center gap-2 min-w-0">
        <GitBranch className="h-4 w-4 text-indigo-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white/80 truncate">{title}</span>
        {report && (
          <span className="text-[10px] text-white/35 font-mono">
            depth {report.summary.depth}
          </span>
        )}
      </div>
      <ChevronDown
        className={cn(
          'h-4 w-4 text-white/30 transition-transform flex-shrink-0',
          expanded && 'rotate-180',
        )}
      />
    </button>
  );

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        {header}
        {expanded && (
          <div className="flex items-center justify-center gap-2 py-6 text-indigo-300/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Tracing evidence chain…</span>
          </div>
        )}
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={cn('rounded-lg border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        {header}
        {expanded && (
          <div className="flex items-center gap-2 py-4 text-white/40 text-xs">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error ?? 'No narrative chain available yet.'}</span>
          </div>
        )}
      </div>
    );
  }

  const chainSteps = report.chain.filter((step) => step.relation !== 'root');

  return (
    <div
      className={cn('rounded-lg border border-indigo-500/20 bg-indigo-950/10', compact ? 'p-3' : 'p-4')}
      data-testid="narrative-provenance-panel"
    >
      {header}

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['evidence', report.summary.evidenceCount],
              ['event', report.summary.eventCount],
              ['interpretation', report.summary.interpretationCount],
              ['meaning', report.summary.meaningCount],
              ['fact', report.summary.factCount],
            ] as const)
              .filter(([, count]) => count > 0)
              .map(([kind, count]) => (
                <span
                  key={kind}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                    KIND_COLORS[kind],
                  )}
                >
                  {count} {KIND_LABELS[kind].toLowerCase()}{count !== 1 ? 's' : ''}
                </span>
              ))}
            {report.summary.oldestEvidenceAt && (
              <span className="text-[10px] text-white/35 self-center">
                oldest {formatDate(report.summary.oldestEvidenceAt)}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-lg border border-indigo-500/25 bg-indigo-950/20">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                    KIND_COLORS[report.claim.kind],
                  )}
                >
                  {KIND_LABELS[report.claim.kind]}
                </span>
                <span className="text-[10px] text-white/35">Current claim</span>
              </div>
              <p className="text-xs text-white/85 leading-relaxed">{report.claim.statement}</p>
              {report.claim.legacy?.excerpt && report.claim.legacy.excerpt !== report.claim.statement && (
                <p className="text-[11px] text-white/45 mt-1.5 line-clamp-2">{report.claim.legacy.excerpt}</p>
              )}
            </div>

            {chainSteps.map((step) => (
              <div key={`${step.claim.id}-${step.viaEdgeId ?? step.relation}`} className="flex gap-2">
                <div className="flex flex-col items-center pt-2">
                  <div className="w-px h-full min-h-[12px] bg-indigo-500/30" />
                </div>
                <div className="flex-1 min-w-0 p-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[10px] text-white/40">
                      {RELATION_LABELS[step.relation]}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                        KIND_COLORS[step.claim.kind],
                      )}
                    >
                      {KIND_LABELS[step.claim.kind]}
                    </span>
                    {step.claim.occurredAt && (
                      <span className="text-[10px] text-white/30">{formatDate(step.claim.occurredAt)}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">{step.claim.statement}</p>
                  {step.claim.legacy?.title && (
                    <p className="text-[10px] text-white/35 mt-1">{step.claim.legacy.title}</p>
                  )}
                </div>
              </div>
            ))}

            {chainSteps.length === 0 && (
              <p className="text-xs text-white/40 text-center py-2">
                This claim stands alone — no upstream evidence linked yet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

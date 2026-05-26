/**
 * ContradictionResolutionPanel
 *
 * Shows the 7-stage entity lifecycle pipeline and any detected contradictions
 * that need human resolution.
 *
 * REAL mode only — lifecycle data is meaningless without a live pipeline.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, AlertCircle, XCircle, MinusCircle, Loader2,
  GitMerge, Layers, Network, Users, GitBranch, Database, BookOpen,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useRuntimeIdentity } from '../../hooks/useRuntimeIdentity';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LifecycleStage {
  name: string;
  status: 'ok' | 'missing' | 'partial' | 'error';
  detail: string | null;
  count?: number;
  firstAt?: string | null;
  lastAt?: string | null;
}

interface ContradictionRecord {
  sourceClaimId: string;
  targetClaimId: string;
  confidence: number;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

interface MergeRecord {
  eventId: string;
  explanation: string;
  createdAt: string;
}

interface LifecycleReport {
  entityId: string;
  entityName: string | null;
  resolvedFromTable: string | null;
  checkedAt: string;
  stages: {
    extracted:       LifecycleStage;
    persisted:       LifecycleStage;
    provenanceGraph: LifecycleStage;
    relationships:   LifecycleStage;
    contradictions:  LifecycleStage;
    merges:          LifecycleStage;
    consolidation:   LifecycleStage;
  };
  mentionCount:       number;
  edgeCount:          number;
  contradictionCount: number;
  mergeCount:         number;
  relationshipCount:  number;
  claimCount:         number;
  contradictions:     ContradictionRecord[];
  mergeHistory:       MergeRecord[];
}

type ResolutionAction = 'keep_newest' | 'keep_oldest' | 'preserve_both' | 'mark_uncertain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_ORDER: Array<keyof LifecycleReport['stages']> = [
  'extracted', 'persisted', 'provenanceGraph', 'relationships',
  'contradictions', 'merges', 'consolidation',
];

const STAGE_LABEL: Record<string, string> = {
  extracted:       'Extracted',
  persisted:       'Persisted',
  provenanceGraph: 'Provenance',
  relationships:   'Relationships',
  contradictions:  'Contradictions',
  merges:          'Merges',
  consolidation:   'Consolidation',
};

const STAGE_ICON: Record<string, React.ElementType> = {
  extracted:       Layers,
  persisted:       Database,
  provenanceGraph: GitBranch,
  relationships:   Users,
  contradictions:  AlertCircle,
  merges:          GitMerge,
  consolidation:   BookOpen,
};

function StatusIcon({ status }: { status: LifecycleStage['status'] }) {
  if (status === 'ok')      return <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />;
  if (status === 'partial') return <MinusCircle  className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
  if (status === 'error')   return <XCircle      className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  return <MinusCircle className="h-3.5 w-3.5 text-white/20 shrink-0" />;
}

function statusColor(status: LifecycleStage['status']): string {
  if (status === 'ok')      return 'border-green-500/20 bg-green-500/5';
  if (status === 'partial') return 'border-yellow-500/20 bg-yellow-500/5';
  if (status === 'error')   return 'border-red-500/20 bg-red-500/5';
  return 'border-white/5 bg-white/[0.02]';
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Contradiction Card ───────────────────────────────────────────────────────

interface ContradictionCardProps {
  record: ContradictionRecord;
  index: number;
  entityId: string;
  onResolved: () => void;
}

function ContradictionCard({ record, index, entityId, onResolved }: ContradictionCardProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const [resolving, setResolving] = useState<ResolutionAction | null>(null);
  const [resolved, setResolved] = useState(false);

  const newText        = record.meta?.newText        as string | undefined;
  const conflictingText = record.meta?.conflictingText as string | undefined;

  const resolve = useCallback(async (action: ResolutionAction) => {
    setResolving(action);
    try {
      const res = await fetch(`/api/characters/${entityId}/contradictions/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceClaimId: record.sourceClaimId,
          targetClaimId: record.targetClaimId,
          action,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResolved(true);
      onResolved();
    } catch {
      // Surface nothing — the button returns to idle on error
    } finally {
      setResolving(null);
    }
  }, [entityId, record.sourceClaimId, record.targetClaimId, onResolved]);

  if (resolved) {
    return (
      <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 flex items-center gap-2 text-xs text-green-400/70">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        Contradiction resolved
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-orange-500/20 bg-orange-500/[0.04] overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
          <span className="text-xs text-orange-300/80 font-medium">Contradiction #{index + 1}</span>
          <span className="text-[10px] text-white/25 ml-1">{formatRelativeDate(record.createdAt)}</span>
          <span className="text-[10px] text-white/25 ml-auto shrink-0">
            {Math.round(record.confidence * 100)}% conf
          </span>
        </div>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-white/30 shrink-0 ml-2" />
          : <ChevronDown className="h-3 w-3 text-white/30 shrink-0 ml-2" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Claim comparison */}
          <div className="grid grid-cols-2 gap-2">
            <ClaimBox label="Newer claim" text={newText} side="new" />
            <ClaimBox label="Older claim" text={conflictingText} side="old" />
          </div>

          {/* Resolution actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <ResolutionButton
              label="Keep newest"
              description="Mark older claim as revised"
              action="keep_newest"
              resolving={resolving}
              onResolve={resolve}
            />
            <ResolutionButton
              label="Keep oldest"
              description="Discard newer claim"
              action="keep_oldest"
              resolving={resolving}
              onResolve={resolve}
            />
            <ResolutionButton
              label="Preserve both"
              description="Mark as contextual, not contradictory"
              action="preserve_both"
              resolving={resolving}
              onResolve={resolve}
            />
            <ResolutionButton
              label="Mark uncertain"
              description="Flag both for later review"
              action="mark_uncertain"
              resolving={resolving}
              onResolve={resolve}
            />
          </div>

          {/* Claim IDs for debugging */}
          <div className="flex gap-3 text-[9px] text-white/15 font-mono">
            <span>src: {record.sourceClaimId.slice(0, 8)}…</span>
            <span>tgt: {record.targetClaimId.slice(0, 8)}…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaimBox({ label, text, side }: { label: string; text?: string; side: 'new' | 'old' }) {
  return (
    <div className={`rounded-md border px-2.5 py-2 text-[10px] ${
      side === 'new' ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/8 bg-white/[0.02]'
    }`}>
      <p className={`font-medium mb-1 ${side === 'new' ? 'text-blue-300/60' : 'text-white/30'}`}>{label}</p>
      <p className="text-white/60 leading-relaxed line-clamp-4">
        {text ?? <span className="text-white/20 italic">text not captured</span>}
      </p>
    </div>
  );
}

function ResolutionButton({
  label, description, action, resolving, onResolve,
}: {
  label: string;
  description: string;
  action: ResolutionAction;
  resolving: ResolutionAction | null;
  onResolve: (a: ResolutionAction) => void;
}) {
  const isActive = resolving === action;
  const isDisabled = resolving !== null;

  return (
    <button
      onClick={() => onResolve(action)}
      disabled={isDisabled}
      title={description}
      className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
        isActive
          ? 'border-white/20 bg-white/10 text-white/70'
          : isDisabled
          ? 'border-white/5 bg-transparent text-white/20 cursor-not-allowed'
          : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/70 hover:border-white/20'
      }`}
    >
      {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}

// ─── Pipeline Stage Row ───────────────────────────────────────────────────────

function StageRow({ stage }: { stage: LifecycleStage }) {
  const Icon = STAGE_ICON[stage.name] ?? Layers;
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${statusColor(stage.status)}`}>
      <Icon className="h-3.5 w-3.5 text-white/30 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">
            {STAGE_LABEL[stage.name] ?? stage.name}
          </span>
          {stage.count !== undefined && (
            <span className="text-[9px] text-white/25 font-mono">{stage.count}</span>
          )}
          <StatusIcon status={stage.status} />
        </div>
        {stage.detail && (
          <p className="text-[10px] text-white/35 mt-0.5 leading-snug">{stage.detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ContradictionResolutionPanelProps {
  entityId: string;
  entityName: string;
}

export function ContradictionResolutionPanel({ entityId, entityName }: ContradictionResolutionPanelProps) {
  const { is } = useRuntimeIdentity();
  const [report, setReport] = useState<LifecycleReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);

  const fetchReport = useCallback(() => {
    if (!is.realUser) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    let cancelled = false;

    fetch(`/api/characters/${entityId}/lifecycle`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LifecycleReport>;
      })
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Failed to load lifecycle'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [entityId, is.realUser]);

  useEffect(() => { return fetchReport(); }, [fetchReport]);

  if (!is.realUser) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-white/40 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking pipeline health…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-red-400/70 text-xs">
        <AlertCircle className="h-3.5 w-3.5" />
        Could not load lifecycle data.
      </div>
    );
  }

  if (!report) return null;

  const stageList = STAGE_ORDER.map((key) => report.stages[key]);
  const hasIssues = stageList.some((s) => s.status === 'partial' || s.status === 'error' || s.status === 'missing');

  return (
    <div className="space-y-4">

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-2">
        <StatChip label="Mentions"  value={report.mentionCount} />
        <StatChip label="Claims"    value={report.claimCount} />
        <StatChip label="Conflicts" value={report.contradictionCount} warn={report.contradictionCount > 0} />
        <StatChip label="Merges"    value={report.mergeCount} />
      </div>

      {/* Pipeline stages — collapsed by default unless there are issues */}
      <section>
        <button
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-white/30 hover:text-white/50 transition-colors mb-2"
          onClick={() => setPipelineExpanded((v) => !v)}
        >
          <Network className="h-3.5 w-3.5" />
          Pipeline stages
          {hasIssues && <span className="ml-1 text-yellow-400/70">· issues detected</span>}
          {pipelineExpanded
            ? <ChevronUp className="h-3 w-3 ml-auto" />
            : <ChevronDown className="h-3 w-3 ml-auto" />
          }
        </button>
        {(pipelineExpanded || hasIssues) && (
          <div className="space-y-1.5">
            {stageList.map((stage) => (
              <StageRow key={stage.name} stage={stage} />
            ))}
          </div>
        )}
      </section>

      {/* Contradictions */}
      {report.contradictions.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-orange-400/60 mb-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Contradictions requiring resolution ({report.contradictions.length})
          </div>
          <div className="space-y-2">
            {report.contradictions.map((c, i) => (
              <ContradictionCard
                key={`${c.sourceClaimId}-${c.targetClaimId}`}
                record={c}
                index={i}
                entityId={entityId}
                onResolved={fetchReport}
              />
            ))}
          </div>
        </section>
      )}

      {/* No contradictions state */}
      {report.contradictions.length === 0 && report.claimCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-400/50 py-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          No contradictions — {entityName}'s knowledge is internally consistent
        </div>
      )}

      {/* Merge history */}
      {report.mergeHistory.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-white/30 mb-2">
            <GitMerge className="h-3.5 w-3.5" />
            Merge history
          </div>
          <div className="space-y-1.5">
            {report.mergeHistory.map((m) => (
              <div key={m.eventId} className="flex items-start gap-2 text-[10px] rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                <GitMerge className="h-3 w-3 text-white/20 mt-0.5 shrink-0" />
                <div>
                  <span className="text-white/50">{m.explanation || 'Entity identity resolved'}</span>
                  <span className="text-white/20 ml-2">{formatRelativeDate(m.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-center ${
      warn ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/5 bg-white/[0.02]'
    }`}>
      <p className={`text-base font-semibold ${warn ? 'text-orange-300' : 'text-white/80'}`}>{value}</p>
      <p className={`text-[10px] mt-0.5 ${warn ? 'text-orange-400/60' : 'text-white/35'}`}>{label}</p>
    </div>
  );
}

/**
 * EntityProvenancePanel
 *
 * Renders the causal history of a character entity:
 * "Why does LoreBook know about this person?"
 *
 * REAL mode only — never shown in DEMO mode.
 * Displays only evidence-backed, provenance-verified data.
 * Empty state is honest: "Not enough data yet."
 */

import { useEffect, useState } from 'react';
import { GitBranch, MessageSquare, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useRuntimeIdentity } from '../../hooks/useRuntimeIdentity';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProvenanceEdge {
  id: string;
  source_id: string;
  source_type: string;
  target_id: string;
  target_type: string;
  relation: string;
  confidence: number;
  to_truth_state: string | null;
  created_at: string;
}

interface SourceUtterance {
  id: string;
  content: string;
  created_at: string;
}

interface MutationRecord {
  id: string;
  mutation_type: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown>;
  rationale: string | null;
  created_at: string;
}

interface ProvenanceReport {
  entityId: string;
  mentionCount: number;
  firstMentionedAt: string | null;
  lastMentionedAt: string | null;
  edges: ProvenanceEdge[];
  lineage: ProvenanceEdge[];
  sourceUtterances: SourceUtterance[];
  mutationHistory: MutationRecord[];
  extractedFromIrIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RELATION_LABEL: Record<string, string> = {
  EXTRACTED_FROM:   'Extracted from',
  COMPILED_INTO:    'Compiled into',
  REVISED_BY:       'Revised by',
  MENTIONED_ENTITY: 'Mentioned in',
  INFERRED_FROM:    'Inferred from',
  CONTRADICTS:      'Contradicts',
  CITED_IN:         'Cited in',
};

const TRUTH_STATE_COLOR: Record<string, string> = {
  CANONICAL:            'text-green-400',
  INFERRED:             'text-blue-400',
  PENDING_VERIFICATION: 'text-yellow-400',
  CONTEXTUAL:           'text-purple-400',
  DISPUTED:             'text-orange-400',
  REVISED:              'text-red-400/70',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EntityProvenancePanelProps {
  entityId: string;
  entityName: string;
}

export function EntityProvenancePanel({ entityId, entityName }: EntityProvenancePanelProps) {
  const { is } = useRuntimeIdentity();
  const [report, setReport] = useState<ProvenanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only runs in REAL_USER runtime
  useEffect(() => {
    if (!is.realUser) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/characters/${entityId}/provenance`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ProvenanceReport>;
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load provenance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityId, is.realUser]);

  // Only visible in REAL_USER runtime — provenance has no meaning in demo/guest/degraded.
  if (!is.realUser) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-white/40 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading provenance…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-red-400/70 text-xs">
        <AlertCircle className="h-3.5 w-3.5" />
        Could not load provenance data.
      </div>
    );
  }

  // Honest empty state
  if (!report || (report.mentionCount === 0 && report.edges.length === 0)) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-5 text-center">
        <GitBranch className="h-5 w-5 text-white/20 mx-auto mb-2" />
        <p className="text-xs text-white/40 font-medium">No provenance recorded yet</p>
        <p className="text-xs text-white/25 mt-1 max-w-xs mx-auto">
          {entityName} will appear here with a causal history once LoreBook has processed
          conversations that mention them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Mentions" value={String(report.mentionCount)} />
        <Stat label="First seen" value={formatDate(report.firstMentionedAt)} />
        <Stat label="Last seen" value={formatDate(report.lastMentionedAt)} />
      </div>

      {/* Source utterances — the raw evidence */}
      {report.sourceUtterances.length > 0 && (
        <section>
          <SectionHeader icon={<MessageSquare className="h-3.5 w-3.5" />} label="Source conversations" />
          <div className="space-y-2 mt-2">
            {report.sourceUtterances.slice(0, 5).map((u) => (
              <div key={u.id} className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-xs text-white/70 leading-relaxed line-clamp-3">&ldquo;{u.content}&rdquo;</p>
                <p className="text-[10px] text-white/30 mt-1">{formatRelativeDate(u.created_at)}</p>
              </div>
            ))}
            {report.sourceUtterances.length > 5 && (
              <p className="text-[10px] text-white/30 px-1">
                +{report.sourceUtterances.length - 5} more conversations
              </p>
            )}
          </div>
        </section>
      )}

      {/* Causal lineage — provenance edge chain */}
      {report.lineage.length > 0 && (
        <section>
          <SectionHeader icon={<GitBranch className="h-3.5 w-3.5" />} label="Causal lineage" />
          <div className="mt-2 space-y-1">
            {report.lineage.map((edge) => (
              <div key={edge.id} className="flex items-center gap-2 text-[10px] text-white/40">
                <span className="font-mono text-white/25">{edge.source_type}</span>
                <span className="text-white/20">→</span>
                <span className="text-white/50">{RELATION_LABEL[edge.relation] ?? edge.relation}</span>
                <span className="text-white/20">→</span>
                <span className="font-mono text-white/25">{edge.target_type}</span>
                {edge.to_truth_state && (
                  <span className={`ml-auto font-mono ${TRUTH_STATE_COLOR[edge.to_truth_state] ?? 'text-white/30'}`}>
                    {edge.to_truth_state}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mutation history */}
      {report.mutationHistory.length > 0 && (
        <section>
          <SectionHeader icon={<Clock className="h-3.5 w-3.5" />} label="Truth-state history" />
          <div className="mt-2 space-y-1.5">
            {report.mutationHistory.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-[10px]">
                <CheckCircle2 className="h-3 w-3 text-white/20 mt-0.5 shrink-0" />
                <div>
                  <span className="text-white/50">{m.mutation_type.replace(/_/g, ' ')}</span>
                  {m.rationale && (
                    <span className="text-white/30 ml-1">— {m.rationale}</span>
                  )}
                  <span className="text-white/20 ml-2">{formatRelativeDate(m.created_at)}</span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-center">
      <p className="text-base font-semibold text-white/80">{value}</p>
      <p className="text-[10px] text-white/35 mt-0.5">{label}</p>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-white/30">
      {icon}
      {label}
    </div>
  );
}

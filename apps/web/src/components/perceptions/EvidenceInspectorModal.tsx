import { useState, useEffect } from 'react';
import { X, Brain, ChevronRight, GitCommit, Shield, Layers, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { knowledgeApi, KNOWLEDGE_TYPE_LABELS, KNOWLEDGE_TYPE_COLORS } from '../../api/knowledge';
import type { KnowledgeClaim, EvidenceLink } from '../../api/knowledge';

interface EvidenceInspectorModalProps {
  claimId: string;
  onClose: () => void;
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  event_candidate: 'Event',
  life_arc: 'Life Arc',
  arc_membership: 'Arc Membership',
  event_interpretation: 'Interpretation',
  resolved_event: 'Resolved Event',
  omega_claim: 'Omega Claim',
  correction: 'User Correction',
  romantic_interaction: 'Romantic Interaction',
  romantic_relationship: 'Relationship',
  relationship_cycle: 'Relationship Cycle',
  relationship_drift: 'Relationship Drift',
};

const confidenceBar = (value: number, max = 1) => {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 w-8 text-right">{pct}%</span>
    </div>
  );
};

export const EvidenceInspectorModal = ({ claimId, onClose }: EvidenceInspectorModalProps) => {
  const [claim, setClaim] = useState<(KnowledgeClaim & { evidence_links: EvidenceLink[]; supersedence_chain: KnowledgeClaim[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    knowledgeApi.getClaim(claimId)
      .then(res => { if (res.success) setClaim(res.claim); else setError('Failed to load claim'); })
      .catch(() => setError('Failed to load claim'))
      .finally(() => setLoading(false));
  }, [claimId]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'bg-green-500/20 text-green-300 border-green-500/30',
      DORMANT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      HISTORICAL: 'bg-white/10 text-white/50 border-white/20',
      SUPERSEDED: 'bg-red-500/20 text-red-300 border-red-500/30',
      PENDING: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    };
    return map[status] ?? 'bg-white/10 text-white/50 border-white/20';
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto bg-gradient-to-br from-black via-indigo-950/30 to-black border-indigo-500/30"
        onClose={onClose}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 flex-1">
            <Brain className="w-5 h-5 text-indigo-400" />
            <DialogTitle className="text-white text-lg">Evidence Inspector</DialogTitle>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2 h-8 w-8" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 py-8 justify-center">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && claim && (
          <div className="space-y-6 mt-2">
            {/* Claim header */}
            <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-white text-sm leading-relaxed flex-1">{claim.human_readable_claim}</p>
                <Badge variant="outline" className={statusBadge(claim.status)}>
                  {claim.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className={`text-xs ${KNOWLEDGE_TYPE_COLORS[claim.knowledge_type] ?? 'text-white/60 border-white/20'}`}>
                  {KNOWLEDGE_TYPE_LABELS[claim.knowledge_type] ?? claim.knowledge_type}
                </Badge>
                <span className="text-xs text-white/40">
                  First evidenced {new Date(claim.first_evidenced_at).toLocaleDateString()}
                </span>
                <span className="text-xs text-white/40">
                  Last reinforced {new Date(claim.last_reinforced_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Confidence breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-400" />
                Confidence Breakdown
                <span className="ml-auto text-indigo-300 font-bold">{Math.round(claim.confidence * 100)}%</span>
              </h3>
              <div className="space-y-2.5 p-3 rounded-lg bg-white/5 border border-white/10">
                {[
                  { key: 'base_evidence', label: 'Base Evidence' },
                  { key: 'temporal_stability', label: 'Temporal Stability' },
                  { key: 'cross_context', label: 'Cross-Context Corroboration' },
                  { key: 'recency_factor', label: 'Recency' },
                  { key: 'contradiction_penalty', label: 'Contradiction Penalty', invert: true },
                ].map(({ key, label, invert }) => {
                  const raw = (claim.confidence_breakdown as Record<string, number>)[key] ?? 0;
                  const display = invert ? 1 - raw : raw;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-white/50 mb-1">
                        <span>{label}</span>
                      </div>
                      {confidenceBar(display)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Evidence links */}
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" />
                Supporting Evidence
                <span className="ml-auto text-xs text-white/40">{claim.evidence_links.length} item{claim.evidence_links.length !== 1 ? 's' : ''}</span>
              </h3>
              {claim.evidence_links.length === 0 ? (
                <p className="text-xs text-white/40 py-4 text-center">No evidence links recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {claim.evidence_links.map((link) => (
                    <div key={link.id} className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs text-white/50 border-white/20 bg-white/5">
                            {EVIDENCE_TYPE_LABELS[link.evidence_type] ?? link.evidence_type}
                          </Badge>
                          <span className={`text-xs font-medium ${link.evidence_weight >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {link.evidence_weight >= 0 ? '+' : ''}{(link.evidence_weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed">{link.evidence_summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Supersedence chain */}
            {claim.supersedence_chain && claim.supersedence_chain.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-indigo-400" />
                  Evolution Chain
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg border border-indigo-500/20 bg-indigo-950/10">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="text-xs text-indigo-300 font-medium">Current</span>
                    </div>
                    <p className="text-xs text-white/80">{claim.human_readable_claim}</p>
                  </div>
                  {claim.supersedence_chain.map((prev, i) => (
                    <div key={prev.id} className="flex items-start gap-2">
                      <div className="flex flex-col items-center mt-1.5">
                        <ChevronRight className="h-3 w-3 text-white/30 rotate-90" />
                      </div>
                      <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-3 w-3 text-white/30" />
                          <span className="text-xs text-white/40">
                            Previous {i + 1} — {new Date(prev.created_at).toLocaleDateString()}
                          </span>
                          <Badge variant="outline" className={`ml-auto text-xs ${statusBadge(prev.status)}`}>
                            {prev.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/60">{prev.human_readable_claim}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

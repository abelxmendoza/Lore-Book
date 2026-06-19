import { useState, useEffect, useMemo } from 'react';
import { Brain, Filter, Loader2, Info, ChevronDown } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { knowledgeApi, KNOWLEDGE_TYPE_LABELS, KNOWLEDGE_TYPE_COLORS } from '../../api/knowledge';
import type { KnowledgeClaim } from '../../api/knowledge';
import { EvidenceInspectorModal } from './EvidenceInspectorModal';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { filterMockSelfKnowledgeClaims, mockSelfKnowledgeClaims } from '../../mocks/selfKnowledgeClaims';

const STATUS_OPTIONS = ['ACTIVE', 'DORMANT', 'HISTORICAL', 'SUPERSEDED', 'ALL'] as const;

const statusLabel = (s: typeof STATUS_OPTIONS[number]) =>
  s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase();

const statusBadgeClass = (status: string) => {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-300 border-green-500/30',
    DORMANT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    HISTORICAL: 'bg-white/10 text-white/50 border-white/20',
    SUPERSEDED: 'bg-red-500/20 text-red-300 border-red-500/30',
    PENDING: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };
  return map[status] ?? 'bg-white/10 text-white/50 border-white/20';
};

const ConfidenceRing = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#eab308' : '#ef4444';
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative h-10 w-10 flex-shrink-0 flex items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[9px] font-bold text-white/80">{pct}</span>
    </div>
  );
};

export const SelfKnowledgeView = () => {
  const useMock = useShouldUseMockData();
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'DORMANT' | 'HISTORICAL' | 'SUPERSEDED' | 'ALL'>('ACTIVE');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    if (useMock) {
      setClaims(filterMockSelfKnowledgeClaims(mockSelfKnowledgeClaims, statusFilter));
      setLoading(false);
      return;
    }
    knowledgeApi.getClaims({ status: statusFilter === 'ALL' ? 'ALL' : statusFilter, include_evidence: false })
      .then(res => { if (res.success) setClaims(res.claims); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, useMock]);

  const allTypes = useMemo(() => {
    const types = new Set(claims.map(c => c.knowledge_type));
    return Array.from(types).sort();
  }, [claims]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return claims;
    return claims.filter(c => c.knowledge_type === typeFilter);
  }, [claims, typeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, KnowledgeClaim[]> = {};
    for (const c of filtered) {
      if (!groups[c.knowledge_type]) groups[c.knowledge_type] = [];
      groups[c.knowledge_type].push(c);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-400 flex-shrink-0" />
          <span className="min-w-0">What LoreBook Knows About You</span>
        </h3>
        <p className="text-xs sm:text-sm text-white/60 mt-1 leading-relaxed">
          Patterns, values, and behavioral tendencies crystallized from your journal entries
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 sm:p-3.5 flex items-start gap-2">
        <Info className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] sm:text-xs text-indigo-200/80 leading-relaxed">
          These are not things you told LoreBook — they are patterns it detected from your behavior, entries, and life arcs.
          Certainty reflects how much behavioral evidence supports each claim — not how strongly you stated it.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/50 flex-shrink-0" />
            <span className="text-xs sm:text-sm text-white/70">Status</span>
          </div>

          {/* Mobile: native select avoids cramped pill row */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="sm:hidden w-full bg-black/60 border border-white/10 text-white text-sm h-9 rounded-lg px-3"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>

          {/* Desktop / tablet: pill row */}
          <div className="hidden sm:flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-500/30 border-indigo-500/50 text-indigo-200'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {allTypes.length > 1 && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs sm:text-sm text-white/70">Type</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full sm:w-auto sm:min-w-[180px] bg-black/60 border border-white/10 text-white text-sm h-9 rounded-lg px-3"
              aria-label="Filter by knowledge type"
            >
              <option value="all">All types</option>
              {allTypes.map(t => (
                <option key={t} value={t}>{KNOWLEDGE_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">No knowledge claims yet</p>
          <p className="text-sm">
            Keep journaling — LoreBook crystallizes behavioral patterns as you build your story.
          </p>
        </div>
      ) : typeFilter !== 'all' ? (
        // Flat list when filtered to one type
        <div className="space-y-2">
          {filtered.map(claim => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              expanded={expandedId === claim.id}
              onToggle={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
              onInspect={() => setSelectedClaimId(claim.id)}
            />
          ))}
        </div>
      ) : (
        // Grouped by type
        <div className="space-y-5">
          {Object.entries(grouped).map(([type, typeClaims]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`text-xs ${KNOWLEDGE_TYPE_COLORS[type] ?? 'text-white/60 border-white/20'}`}>
                  {KNOWLEDGE_TYPE_LABELS[type] ?? type}
                </Badge>
                <span className="text-xs text-white/30">{typeClaims.length} claim{typeClaims.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {typeClaims.map(claim => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    expanded={expandedId === claim.id}
                    onToggle={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
                    onInspect={() => setSelectedClaimId(claim.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedClaimId && (
        <EvidenceInspectorModal claimId={selectedClaimId} onClose={() => setSelectedClaimId(null)} />
      )}
    </div>
  );
};

const ClaimCard = ({
  claim,
  expanded,
  onToggle,
  onInspect,
}: {
  claim: KnowledgeClaim;
  expanded: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) => {
  const pct = Math.round(claim.confidence * 100);
  const evidenceCount = (claim.evidence_links ?? []).length;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors cursor-pointer overflow-hidden touch-manipulation"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5">
        <ConfidenceRing value={claim.confidence} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-sm text-white/90 leading-snug">{claim.human_readable_claim}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <Badge variant="outline" className={`text-[10px] py-0 ${statusBadgeClass(claim.status)}`}>
              {claim.status}
            </Badge>
            <span className="text-[10px] text-white/30">
              Reinforced {new Date(claim.last_reinforced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/30 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t border-white/10 px-3 sm:px-3.5 pb-3 pt-2 space-y-2" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded bg-white/5">
              <p className="text-white/40 mb-0.5">Certainty</p>
              <p className="text-white font-semibold">{pct}%</p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-white/40 mb-0.5">Evidence</p>
              <p className="text-white font-semibold">{evidenceCount > 0 ? evidenceCount : '—'}</p>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2 rounded bg-white/5">
              <p className="text-white/40 mb-0.5">Type</p>
              <p className="text-white font-semibold truncate">{KNOWLEDGE_TYPE_LABELS[claim.knowledge_type] ?? claim.knowledge_type}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onInspect}
            className="w-full min-h-10 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
          >
            <Brain className="h-3 w-3 mr-1" />
            Inspect Evidence
          </Button>
        </div>
      )}
    </div>
  );
};

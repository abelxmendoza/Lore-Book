/**
 * Memory Review Queue Panel
 * The trust choke point - users see and control what memories are being proposed
 */

import { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Edit, 
  Clock, 
  AlertTriangle, 
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useMemoryReviewQueue, type MemoryProposal } from '../../hooks/useMemoryReviewQueue';

const RiskBadge = ({ riskLevel }: { riskLevel: string }) => {
  const colors = {
    LOW: 'bg-green-500/20 text-green-400 border-green-500/50',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    HIGH: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[riskLevel as keyof typeof colors] || colors.MEDIUM}`}>
      {riskLevel} Risk
    </span>
  );
};

const ConfidenceBar = ({ confidence }: { confidence: number }) => {
  const percentage = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right">{percentage}%</span>
    </div>
  );
};

interface ProposalCardProps {
  proposal: MemoryProposal;
  onAction: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onEdit: (id: string, newText: string, newConfidence?: number) => Promise<void>;
  onDefer: (id: string) => Promise<void>;
}

const ProposalCard = ({ proposal, onAction, onApprove, onReject, onEdit, onDefer }: ProposalCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(proposal.claim_text);
  const [editConfidence, setEditConfidence] = useState(proposal.confidence);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await onApprove(proposal.id);
      onAction();
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Why are you rejecting this? (optional)');
    setActionLoading('reject');
    try {
      await onReject(proposal.id, reason || undefined);
      onAction();
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    setActionLoading('edit');
    try {
      await onEdit(proposal.id, editText, editConfidence);
      setEditing(false);
      onAction();
    } catch (error) {
      console.error('Failed to edit:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDefer = async () => {
    setActionLoading('defer');
    try {
      await onDefer(proposal.id);
      onAction();
    } catch (error) {
      console.error('Failed to defer:', error);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <RiskBadge riskLevel={proposal.risk_level} />
            <ConfidenceBar confidence={proposal.confidence} />
          </div>
          <p className="text-white text-sm leading-relaxed">
            {editing ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded p-2 text-white text-sm resize-none"
                rows={3}
              />
            ) : (
              proposal.claim_text
            )}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-white/70" />
          ) : (
            <ChevronDown className="h-5 w-5 text-white/70" />
          )}
        </button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="space-y-3 pt-3 border-t border-white/10">
          {proposal.reasoning && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-white/60" />
                <span className="text-xs font-medium text-white/60">Why this was suggested</span>
              </div>
              <p className="text-sm text-white/80 ml-6">{proposal.reasoning}</p>
            </div>
          )}

          {proposal.source_excerpt && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-white/60" />
                <span className="text-xs font-medium text-white/60">Source excerpt</span>
              </div>
              <p className="text-sm text-white/80 ml-6 italic">"{proposal.source_excerpt}"</p>
            </div>
          )}

          {proposal.affected_claim_ids && proposal.affected_claim_ids.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-xs font-medium text-white/60">
                  Affects {proposal.affected_claim_ids.length} existing {proposal.affected_claim_ids.length === 1 ? 'claim' : 'claims'}
                </span>
              </div>
            </div>
          )}

          {editing && (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">
                Confidence: {Math.round(editConfidence * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={editConfidence}
                onChange={(e) => setEditConfidence(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        {editing ? (
          <>
            <button
              onClick={handleEdit}
              disabled={!editText.trim() || actionLoading !== null}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {actionLoading === 'edit' ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditText(proposal.claim_text);
                setEditConfidence(proposal.confidence);
              }}
              className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleApprove}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <CheckCircle2 className="h-4 w-4" />
              {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <XCircle className="h-4 w-4" />
              {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
            </button>
            <button
              onClick={handleDefer}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <Clock className="h-4 w-4" />
              {actionLoading === 'defer' ? 'Deferring...' : 'Defer'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const MemoryReviewQueuePanel = () => {
  const { proposals, loading, error, refetch, approveProposal, rejectProposal, editProposal, deferProposal } = useMemoryReviewQueue();

  // Group by risk level
  const grouped = {
    HIGH: proposals.filter(p => p.risk_level === 'HIGH'),
    MEDIUM: proposals.filter(p => p.risk_level === 'MEDIUM'),
    LOW: proposals.filter(p => p.risk_level === 'LOW'),
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-white/60">Loading memory proposals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load proposals</p>
        <p className="text-sm text-white/60 mb-4">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
        <p className="text-white/60 mb-2">No pending proposals</p>
        <p className="text-sm text-white/40">
          All memory proposals have been reviewed, or no new proposals have been generated yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Memory Review Queue</h3>
            <p className="text-sm text-white/70">
              These are memory proposals that need your review. Low-risk items are auto-approved, 
              but medium and high-risk items require your decision. You can approve, edit, reject, or defer each proposal.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="text-2xl font-bold text-red-400">{grouped.HIGH.length}</div>
          <div className="text-xs text-white/60">High Risk</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="text-2xl font-bold text-yellow-400">{grouped.MEDIUM.length}</div>
          <div className="text-xs text-white/60">Medium Risk</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-400">{grouped.LOW.length}</div>
          <div className="text-xs text-white/60">Low Risk</div>
        </div>
      </div>

      {/* Proposals List - Ordered by Risk */}
      <div className="space-y-4">
        {grouped.HIGH.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              High Risk ({grouped.HIGH.length})
            </h3>
            <div className="space-y-3">
              {grouped.HIGH.map(proposal => (
                <ProposalCard 
                  key={proposal.id} 
                  proposal={proposal} 
                  onAction={refetch}
                  onApprove={approveProposal}
                  onReject={rejectProposal}
                  onEdit={editProposal}
                  onDefer={deferProposal}
                />
              ))}
            </div>
          </div>
        )}

        {grouped.MEDIUM.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Medium Risk ({grouped.MEDIUM.length})
            </h3>
            <div className="space-y-3">
              {grouped.MEDIUM.map(proposal => (
                <ProposalCard 
                  key={proposal.id} 
                  proposal={proposal} 
                  onAction={refetch}
                  onApprove={approveProposal}
                  onReject={rejectProposal}
                  onEdit={editProposal}
                  onDefer={deferProposal}
                />
              ))}
            </div>
          </div>
        )}

        {grouped.LOW.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Info className="h-5 w-5 text-green-400" />
              Low Risk ({grouped.LOW.length})
            </h3>
            <div className="space-y-3">
              {grouped.LOW.map(proposal => (
                <ProposalCard 
                  key={proposal.id} 
                  proposal={proposal} 
                  onAction={refetch}
                  onApprove={approveProposal}
                  onReject={rejectProposal}
                  onEdit={editProposal}
                  onDefer={deferProposal}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


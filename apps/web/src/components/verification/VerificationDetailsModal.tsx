import { X } from 'lucide-react';
import { Modal } from '../ui/modal';
import { VerificationBadge } from './VerificationBadge';
import type { EntryVerification } from '../../api/verification';

type VerificationDetailsModalProps = {
  verification: EntryVerification;
  onClose: () => void;
};

export const VerificationDetailsModal = ({ verification, onClose }: VerificationDetailsModalProps) => {
  const report = verification.verification_report as {
    facts_checked?: number;
    facts_verified?: number;
    facts_contradicted?: number;
    facts_unverified?: number;
    details?: Array<{
      fact: {
        claim_type: string;
        subject: string;
        attribute: string;
        value: string;
      };
      status: string;
      evidence?: Array<{ entry_id: string; entry_date: string; content_snippet: string }>;
      contradictions?: Array<{ entry_id: string; entry_date: string; content_snippet: string }>;
    }>;
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Verification Details">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <VerificationBadge status={verification.verification_status} size="lg" showLabel />
          <div className="text-sm text-white/60">
            Verified {new Date(verification.verified_at).toLocaleString()}
          </div>
        </div>

        {/* Entry Content */}
        {verification.entry && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-white/80">Entry</h3>
            <div className="rounded-lg border border-white/10 bg-black/40 p-4">
              <p className="text-sm text-white/90">{verification.entry.content}</p>
              {verification.entry.summary && (
                <p className="mt-2 text-xs text-white/60">{verification.entry.summary}</p>
              )}
            </div>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="text-xs text-white/60">Confidence Score</div>
            <div className="mt-1 text-lg font-bold text-white">
              {(verification.confidence_score * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="text-xs text-white/60">Evidence Count</div>
            <div className="mt-1 text-lg font-bold text-white">{verification.evidence_count}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="text-xs text-white/60">Contradictions</div>
            <div className="mt-1 text-lg font-bold text-red-400">{verification.contradiction_count}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="text-xs text-white/60">Facts Checked</div>
            <div className="mt-1 text-lg font-bold text-white">{report.facts_checked || 0}</div>
          </div>
        </div>

        {/* Extracted Facts */}
        {report.details && report.details.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-white/80">Extracted Facts</h3>
            <div className="space-y-3">
              {report.details.map((detail, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-black/40 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {detail.fact.subject} - {detail.fact.attribute}
                      </div>
                      <div className="text-xs text-white/60 mt-1">{detail.fact.value}</div>
                    </div>
                    <VerificationBadge status={detail.status as any} size="sm" />
                  </div>
                  {detail.evidence && detail.evidence.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="text-xs font-medium text-green-400 mb-2">
                        Supporting Evidence ({detail.evidence.length})
                      </div>
                      {detail.evidence.slice(0, 2).map((ev, i) => (
                        <div key={i} className="mb-2 rounded bg-green-400/10 p-2 text-xs text-white/80">
                          {ev.content_snippet}
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.contradictions && detail.contradictions.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="text-xs font-medium text-red-400 mb-2">
                        Contradictions ({detail.contradictions.length})
                      </div>
                      {detail.contradictions.slice(0, 2).map((cont, i) => (
                        <div key={i} className="mb-2 rounded bg-red-400/10 p-2 text-xs text-white/80">
                          {cont.content_snippet}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supporting/Contradicting Entries */}
        {(verification.supporting_entries.length > 0 || verification.contradicting_entries.length > 0) && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-white/80">Related Entries</h3>
            <div className="space-y-3">
              {verification.supporting_entries.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-green-400">
                    Supporting ({verification.supporting_entries.length})
                  </div>
                  <div className="space-y-1">
                    {verification.supporting_entries.slice(0, 3).map((entryId) => (
                      <div key={entryId} className="rounded bg-green-400/10 p-2 text-xs text-white/80">
                        Entry ID: {entryId.substring(0, 8)}...
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {verification.contradicting_entries.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-red-400">
                    Contradicting ({verification.contradicting_entries.length})
                  </div>
                  <div className="space-y-1">
                    {verification.contradicting_entries.slice(0, 3).map((entryId) => (
                      <div key={entryId} className="rounded bg-red-400/10 p-2 text-xs text-white/80">
                        Entry ID: {entryId.substring(0, 8)}...
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};


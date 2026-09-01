import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../lib/api';
import type { ArcTrack, ArcType, LifeArc } from './useLifeArcs';
import type { LoreEntityRef, LoreIntakeChannel, LoreSourceRef } from '../lib/api-contracts';

export type LifeArcProposalEvidence = {
  sourceKind: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceId: string;
  sourceIds: string[];
  title: string;
  occurredAt: string;
  confidence: number;
  sourceType?: string;
  intakeChannel?: LoreIntakeChannel;
  sources?: LoreSourceRef[];
  entities?: LoreEntityRef[];
};

export type LifeArcProposal = {
  id: string;
  fingerprint: string;
  title: string;
  arc_type: Exclude<ArcType, 'occasion'>;
  track: ArcTrack;
  start_date: string;
  end_date: string;
  confidence: number;
  explanation: string;
  source_record_ids: string[];
  evidence: LifeArcProposalEvidence[];
  status: 'pending' | 'created' | 'merged' | 'dismissed';
};

export type LifeArcProposalAudit = {
  canonicalItems: number;
  datedItems: number;
  eligibleItems: number;
  unresolvedItems: number;
  existingArcs: number;
  drawableArcs: number;
  suppressedArcs: Partial<Record<NonNullable<LifeArc['bar_eligibility']>['reason'] & string, number>>;
  proposedArcs: number;
  dataErrors: Array<{ source: string; message: string }>;
};

export function useLifeArcProposals(enabled = true) {
  const [proposals, setProposals] = useState<LifeArcProposal[]>([]);
  const [audit, setAudit] = useState<LifeArcProposalAudit | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ proposals: LifeArcProposal[] }>('/api/life-arcs/proposals?status=pending');
      setProposals(result.proposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load arc suggestions');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const build = useCallback(async (opts?: { autoCreateReady?: boolean }) => {
    setBuilding(true);
    setError(null);
    try {
      const result = await fetchJson<{
        audit: LifeArcProposalAudit;
        proposals: LifeArcProposal[];
        autoCreated?: LifeArc[];
      }>(
        '/api/life-arcs/proposals/build',
        {
          method: 'POST',
          body: JSON.stringify({
            persist: true,
            auto_create_ready: opts?.autoCreateReady ?? false,
          }),
        },
      );
      setAudit(result.audit);
      setProposals(result.proposals ?? []);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build arc suggestions');
      return null;
    } finally {
      setBuilding(false);
    }
  }, []);

  const [creatingReady, setCreatingReady] = useState(false);

  const createReady = useCallback(async () => {
    setCreatingReady(true);
    setError(null);
    try {
      const result = await fetchJson<{ created: LifeArc[]; skipped: number }>(
        '/api/life-arcs/proposals/create-ready',
        { method: 'POST' },
      );
      await refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create ready bars');
      return null;
    } finally {
      setCreatingReady(false);
    }
  }, [refresh]);

  const update = useCallback(async (proposalId: string, patch: Partial<Pick<LifeArcProposal, 'title' | 'track' | 'arc_type' | 'start_date' | 'end_date'>>) => {
    const result = await fetchJson<{ proposal: LifeArcProposal }>(`/api/life-arcs/proposals/${proposalId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setProposals((current) => current.map((proposal) => proposal.id === proposalId ? result.proposal : proposal));
    return result.proposal;
  }, []);

  const act = useCallback(async (proposalId: string, action: 'create' | 'merge' | 'dismiss', body: Record<string, unknown> = {}) => {
    await fetchJson(`/api/life-arcs/proposals/${proposalId}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setProposals((current) => current.filter((proposal) => proposal.id !== proposalId));
  }, []);

  return { proposals, audit, loading, building, creatingReady, error, refresh, build, createReady, update, act };
}

import { useEffect, useState } from 'react';

import { knowledgeApi } from '../../api/knowledge';
import {
  projectClaimForKnowledgeInspector,
  type KernelInspection,
} from '../../api/knowledgeKernel';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { getMockSelfKnowledgeClaim } from '../../mocks/selfKnowledgeClaims';
import { KnowledgeInspector } from '../epistemic/KnowledgeInspector';

interface EvidenceInspectorModalProps {
  claimId: string;
  onClose: () => void;
}

export const EvidenceInspectorModal = ({ claimId, onClose }: EvidenceInspectorModalProps) => {
  const useMock = useShouldUseMockData();
  const [inspection, setInspection] = useState<KernelInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInspection(null);

    if (useMock) {
      const mockClaim = getMockSelfKnowledgeClaim(claimId);
      if (mockClaim) setInspection(projectClaimForKnowledgeInspector(mockClaim));
      else setError('Failed to load claim');
      setLoading(false);
      return () => { active = false; };
    }
    knowledgeApi.getClaim(claimId)
      .then(res => {
        if (!active) return;
        if (res.success) setInspection(projectClaimForKnowledgeInspector(res.claim));
        else setError('Failed to load claim');
      })
      .catch(() => { if (active) setError('Failed to load claim'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [claimId, useMock]);

  return (
    <KnowledgeInspector
      open
      onClose={onClose}
      assertion={inspection?.assertion ?? null}
      evidence={inspection?.evidence}
      revisions={inspection?.revisions}
      warnings={error ? [error] : inspection?.warnings}
      loading={loading}
    />
  );
};

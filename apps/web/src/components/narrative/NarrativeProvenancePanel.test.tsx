import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NarrativeProvenancePanel } from './NarrativeProvenancePanel';
import type { NarrativeProvenanceReport } from '../../api/narrativeProvenance';

const mockReport: NarrativeProvenanceReport = {
  claim: {
    id: 'claim-1',
    kind: 'meaning',
    statement: 'I value deep work over constant availability.',
    summary: null,
    confidence: 0.82,
    status: 'active',
    sourceTable: 'crystallized_knowledge',
    sourceId: 'ck-1',
    occurredAt: null,
    occurredEnd: null,
    significance: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
  upstream: [],
  downstream: [],
  edges: [],
  chain: [
    {
      claim: {
        id: 'ev-1',
        kind: 'evidence',
        statement: 'I turned off Slack notifications during focus blocks.',
        summary: null,
        confidence: 0.9,
        status: 'active',
        sourceTable: 'journal_entries',
        sourceId: 'je-1',
        occurredAt: '2025-12-01T00:00:00Z',
        occurredEnd: null,
        significance: null,
        createdAt: '2025-12-01T00:00:00Z',
      },
      relation: 'evidences',
      viaEdgeId: 'edge-1',
      depth: 1,
    },
    {
      claim: {
        id: 'claim-1',
        kind: 'meaning',
        statement: 'I value deep work over constant availability.',
        summary: null,
        confidence: 0.82,
        status: 'active',
        sourceTable: 'crystallized_knowledge',
        sourceId: 'ck-1',
        occurredAt: null,
        occurredEnd: null,
        significance: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      relation: 'root',
      viaEdgeId: null,
      depth: 0,
    },
  ],
  summary: {
    factCount: 0,
    eventCount: 0,
    evidenceCount: 1,
    interpretationCount: 0,
    meaningCount: 1,
    oldestEvidenceAt: '2025-12-01T00:00:00Z',
    depth: 1,
  },
};

vi.mock('../../api/narrativeProvenance', () => ({
  narrativeProvenanceApi: {
    getByClaimId: vi.fn(),
    lookupBySource: vi.fn(),
  },
}));

import { narrativeProvenanceApi } from '../../api/narrativeProvenance';

describe('NarrativeProvenancePanel', () => {
  beforeEach(() => {
    vi.mocked(narrativeProvenanceApi.getByClaimId).mockReset();
    vi.mocked(narrativeProvenanceApi.lookupBySource).mockReset();
  });

  it('renders the evidence chain for a crystallized knowledge claim', async () => {
    vi.mocked(narrativeProvenanceApi.lookupBySource).mockResolvedValue(mockReport);

    render(
      <NarrativeProvenancePanel
        sourceTable="crystallized_knowledge"
        sourceId="ck-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('narrative-provenance-panel')).toBeInTheDocument();
    });

    expect(screen.getByText('I value deep work over constant availability.')).toBeInTheDocument();
    expect(screen.getByText('I turned off Slack notifications during focus blocks.')).toBeInTheDocument();
    expect(screen.getByText(/1 evidence/)).toBeInTheDocument();
  });

  it('shows an honest empty state when lookup fails', async () => {
    vi.mocked(narrativeProvenanceApi.lookupBySource).mockRejectedValue(new Error('404'));

    render(
      <NarrativeProvenancePanel
        sourceTable="journal_entries"
        sourceId="missing"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No narrative chain available yet.')).toBeInTheDocument();
    });
  });
});

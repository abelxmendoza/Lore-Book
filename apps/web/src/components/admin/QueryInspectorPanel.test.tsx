import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock('../../lib/api', () => ({
  fetchJson: fetchJsonMock,
}));

import { QueryInspectorPanel } from './QueryInspectorPanel';

describe('QueryInspectorPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the admin their own explainable query trace', async () => {
    fetchJsonMock.mockResolvedValue({
      traces: [{
        at: '2026-07-28T12:00:00.000Z',
        query: 'Who introduced me to Marcus?',
        intent: 'GRAPH',
        intentConfidence: 0.9,
        resolvedEntities: [{
          mention: 'Marcus',
          canonicalName: 'Marcus',
          type: 'character',
          confidence: 1,
          method: 'exact',
        }],
        executors: [{
          kind: 'graph',
          executed: true,
          latencyMs: 24,
          recordCount: 1,
          confidence: 0.9,
          tier: 1,
        }],
        totalLatencyMs: 31,
        mergedRecordCount: 1,
        finalConfidence: 0.9,
        earlyStopped: false,
      }],
    });

    render(<QueryInspectorPanel />);

    expect(await screen.findByText('Who introduced me to Marcus?')).toBeInTheDocument();
    expect(screen.getByText(/90% confidence/i)).toBeInTheDocument();
    screen.getByText('Who introduced me to Marcus?').click();
    expect(screen.getAllByText(/1 records/i)).toHaveLength(2);
    expect(fetchJsonMock).toHaveBeenCalledWith('/api/admin/query-inspector?limit=30');
  });
});

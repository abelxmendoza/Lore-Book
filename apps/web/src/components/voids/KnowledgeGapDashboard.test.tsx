import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
import { KnowledgeGapDashboard } from './KnowledgeGapDashboard';
import { fetchJson } from '../../lib/api';
import { fetchTrustOverview } from '../../api/trust';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => false),
}));

vi.mock('../../hooks/useGoBack', () => ({
  useGoBack: () => ({ goBack: vi.fn(), backLabel: 'Back to Home' }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../api/trust', () => ({
  fetchTrustOverview: vi.fn(),
}));

vi.mock('../trust/TrustCoveragePanel', () => ({
  TrustCoveragePanel: ({ demoMode }: { demoMode?: boolean }) => (
    <div data-testid="trust-coverage-panel">{demoMode ? 'Demo data' : 'Live coverage'}</div>
  ),
}));

describe('KnowledgeGapDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShouldUseMockData).mockReturnValue(false);
    vi.mocked(fetchJson).mockImplementation(async (url: RequestInfo) => {
      const path = String(url);
      if (path.includes('/api/voids/stats')) {
        return {
          totalGaps: 0,
          totalMissingDays: 0,
          averageGapDuration: 0,
          mostSignificantGap: null,
          coveragePercentage: 0,
          timelineSpan: null,
        };
      }
      if (path.includes('/api/voids/knowledge-gaps')) {
        return { gaps: [] };
      }
      return { voids: [], totalGaps: 0 };
    });
    vi.mocked(fetchTrustOverview).mockResolvedValue({
      generated_at: new Date().toISOString(),
      overall_coverage_score: 0,
      coverage: [],
      confidence: { average: 0 },
      unknowns: [],
      conflicts: [],
      review_queue: [],
      state_totals: { known: 0, suggested: 0, unverified: 0, conflicted: 0, archived: 0 },
    });
  });

  it('does not load demo Tío Ray / mock voids for a logged-in account', async () => {
    render(<KnowledgeGapDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Knowledge Gaps')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Tío Ray/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tio Ray/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Demo data')).not.toBeInTheDocument();
    expect(screen.getByTestId('trust-coverage-panel')).toHaveTextContent('Live coverage');
    expect(screen.getByText('No gaps found matching your filter.')).toBeInTheDocument();
  });
});

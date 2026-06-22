import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const fetchJsonMock = vi.fn();
vi.mock('../../lib/api', () => ({ fetchJson: (...a: unknown[]) => fetchJsonMock(...a) }));
vi.mock('../../config/env', () => ({ config: { api: { adminTimeout: 30_000 } } }));

import { CostDashboard } from './CostDashboard';

const SUMMARY = {
  rangeDays: 30,
  since: '2026-05-23',
  totalUsd: 1.2345,
  totalCalls: 128,
  byOperation: [
    { operation: 'chat', usd: 0.9, calls: 80, pctOfTotal: 72.9 },
    { operation: 'ingestion', usd: 0.25, calls: 40, pctOfTotal: 20.3 },
    { operation: 'embedding', usd: 0.0845, calls: 8, pctOfTotal: 6.8 },
  ],
  byModel: [{ model: 'gpt-4o-mini', usd: 1.2345, calls: 128 }],
  byDay: [{ day: '2026-06-22', usd: 1.2345, calls: 128 }],
  budget: null,
  derived: { chatUsd: 0.9, avgUsdPerDay: 1.2345 },
};

describe('CostDashboard', () => {
  beforeEach(() => fetchJsonMock.mockReset());

  it('shows a loading state, then renders whole-app cost with operation attribution', async () => {
    fetchJsonMock.mockResolvedValue(SUMMARY);
    render(<CostDashboard />);

    expect(screen.getByText(/Loading AI cost/i)).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId('ai-cost-dashboard')).toBeTruthy());
    const panel = screen.getByTestId('ai-cost-dashboard');
    expect(panel.textContent).toContain('$1.23'); // total
    expect(panel.textContent).toContain('chat'); // where
    expect(panel.textContent).toContain('ingestion');
    expect(panel.textContent).toContain('embedding');
    expect(panel.textContent).toContain('gpt-4o-mini'); // model
    // calls the right admin endpoint
    expect(fetchJsonMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/cost'),
      undefined,
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });

  it('renders the empty state when no cost is recorded', async () => {
    fetchJsonMock.mockResolvedValue({
      rangeDays: 30,
      since: '2026-05-23',
      totalUsd: 0,
      totalCalls: 0,
      byOperation: [],
      byModel: [],
      byDay: [],
      budget: null,
      derived: { chatUsd: 0, avgUsdPerDay: 0 },
    });
    render(<CostDashboard />);
    await waitFor(() => expect(screen.getByTestId('ai-cost-dashboard')).toBeTruthy());
    expect(screen.getAllByText(/No cost recorded yet/i).length).toBeGreaterThan(0);
  });

  it('renders a budget bar when a budget is present', async () => {
    fetchJsonMock.mockResolvedValue({
      ...SUMMARY,
      budget: { enabled: true, monthlyLimitUsd: 100, spentUsd: 10, remainingUsd: 90, percentUsed: 10 },
    });
    render(<CostDashboard />);
    await waitFor(() => expect(screen.getByTestId('ai-cost-dashboard')).toBeTruthy());
    expect(screen.getByText(/Monthly budget/i)).toBeTruthy();
  });

  it('tolerates a partial API response without crashing', async () => {
    // Missing byModel/byDay arrays (legacy shape) — must not throw.
    fetchJsonMock.mockResolvedValue({
      rangeDays: 30,
      since: '2026-05-23',
      totalUsd: 0.5,
      totalCalls: 5,
      byOperation: [{ operation: 'chat', usd: 0.5, calls: 5, pctOfTotal: 100 }],
      budget: null,
    });
    render(<CostDashboard />);
    await waitFor(() => expect(screen.getByTestId('ai-cost-dashboard')).toBeTruthy());
    expect(screen.getByTestId('ai-cost-dashboard').textContent).toContain('chat');
  });
});

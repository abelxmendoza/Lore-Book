import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrustCoveragePanel } from '../TrustCoveragePanel';
import { getMockTrustOverview } from '../../../mocks/trustOverview';

describe('TrustCoveragePanel', () => {
  it('renders lore coverage rollup with review queue', () => {
    const overview = getMockTrustOverview();

    render(
      <MemoryRouter>
        <TrustCoveragePanel overview={overview} demoMode />
      </MemoryRouter>
    );

    expect(screen.getByTestId('trust-coverage-panel')).toBeInTheDocument();
    expect(screen.getByText('Lore coverage')).toBeInTheDocument();
    expect(screen.getByText('Review next')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /review/i }).length).toBeGreaterThan(0);
  });
});

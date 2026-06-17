import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useMockData } from '../../../contexts/MockDataContext';
import { TheirConnectionsPanel } from '../TheirConnectionsPanel';

vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

describe('TheirConnectionsPanel', () => {
  beforeEach(() => {
    (useMockData as ReturnType<typeof vi.fn>).mockReturnValue({ useMockData: true });
  });

  it('renders Sam periphery for rel-003', async () => {
    render(
      <TheirConnectionsPanel relationshipId="rel-003" anchorName="Sam" />
    );

    expect(await screen.findByTestId('their-connections-panel')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-card-periph-sam-marcus')).toBeInTheDocument();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-tier-suspected')).toBeInTheDocument();
  });

  it('filters confirmed only', async () => {
    render(
      <TheirConnectionsPanel relationshipId="rel-004" anchorName="Taylor" />
    );

    await screen.findByTestId('peripheral-card-periph-taylor-jordan');
    fireEvent.click(screen.getByTestId('peripheral-filter-suspected'));
    expect(screen.queryByTestId('peripheral-card-periph-taylor-jordan')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('peripheral-filter-confirmed'));
    expect(screen.getByTestId('peripheral-card-periph-taylor-jordan')).toBeInTheDocument();
  });

  it('shows empty state for relationship without periphery', async () => {
    render(
      <TheirConnectionsPanel relationshipId="rel-002" anchorName="Jordan" />
    );

    expect(await screen.findByTestId('their-connections-empty')).toBeInTheDocument();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useMockData } from '../../../contexts/MockDataContext';
import { RelationshipPeripheralsPanel } from '../RelationshipPeripheralsPanel';

vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

describe('RelationshipPeripheralsPanel', () => {
  beforeEach(() => {
    (useMockData as ReturnType<typeof vi.fn>).mockReturnValue({ useMockData: true });
  });

  it('renders Sam multi-domain network', async () => {
    render(
      <RelationshipPeripheralsPanel
        anchorKind="character"
        anchorId="char-003"
        anchorName="Sam"
      />
    );

    expect(await screen.findByTestId('relationship-peripherals-panel')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-card-periph-sam-roommate')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-card-periph-sam-marcus-romantic')).toBeInTheDocument();
  });

  it('renders Sarah family periphery', async () => {
    render(
      <RelationshipPeripheralsPanel
        anchorKind="character"
        anchorId="dummy-1"
        anchorName="Sarah Chen"
      />
    );

    expect(await screen.findByTestId('peripheral-card-periph-sarah-sister')).toBeInTheDocument();
    expect(screen.getByText('Carmen')).toBeInTheDocument();
  });
});

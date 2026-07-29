import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useMockData } from '../../../contexts/MockDataContext';
import { TheirConnectionsPanel } from '../TheirConnectionsPanel';
import {
  DEMO_RELATIONSHIP_IDS_WITH_PERIPHERY,
  getMockPeripheralsForRelationship,
} from '../../../mocks/romanticPeripherals';

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

    expect(await screen.findByTestId('relationship-peripherals-panel')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-card-periph-sam-marcus')).toBeInTheDocument();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getAllByTestId('peripheral-tier-suspected').length).toBeGreaterThan(0);
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

  it('shows Elena periphery with Character Book profiles already linked', async () => {
    render(
      <TheirConnectionsPanel relationshipId="rel-009" anchorName="Elena" />
    );

    expect(await screen.findByTestId('peripheral-card-periph-elena-college-friend')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-card-periph-elena-current-rumor')).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('Chris')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-open-book-periph-elena-college-friend')).toBeInTheDocument();
    expect(screen.getByTestId('peripheral-open-book-periph-elena-current-rumor')).toBeInTheDocument();
    expect(screen.getAllByText(/Open Character Book card/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Add to Character Book')).not.toBeInTheDocument();
    expect(screen.queryByTestId('relationship-peripherals-empty')).not.toBeInTheDocument();
  });

  it('opens peripheral Character Book card via callback', async () => {
    const onOpen = vi.fn();
    render(
      <TheirConnectionsPanel
        relationshipId="rel-009"
        anchorName="Elena"
        onOpenPeripheralCharacter={onOpen}
      />
    );

    await screen.findByTestId('peripheral-open-book-periph-elena-college-friend');
    fireEvent.click(screen.getByTestId('peripheral-open-book-periph-elena-college-friend'));
    expect(onOpen).toHaveBeenCalledWith('romantic-periph-maya');
  });

  it('covers every demo relationship with at least one peripheral', () => {
    for (const id of DEMO_RELATIONSHIP_IDS_WITH_PERIPHERY) {
      const rows = getMockPeripheralsForRelationship(id);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => Boolean(row.peripheral_person_id))).toBe(true);
    }
  });
});

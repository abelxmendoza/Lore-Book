// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RelationshipTimeline } from '../RelationshipTimeline';

vi.mock('../../../lib/openChatWithFocus', () => ({
  openChatWithFocus: vi.fn(),
}));

vi.mock('../../../lib/openCharacterBookModal', () => ({
  openCharacterBookModal: vi.fn(),
}));

describe('RelationshipTimeline', () => {
  const mockRelationship = {
    id: 'rel-001',
    person_id: 'char-001',
    character_id: 'char-001',
    person_type: 'character' as const,
    person_name: 'Alex',
    start_date: '2024-01-01T00:00:00Z',
    end_date: undefined,
    status: 'active',
  };

  const mockDates = [
    {
      id: 'date-001',
      date_type: 'first_date',
      date_time: '2024-01-15T00:00:00Z',
      location: 'Coffee shop',
      description: 'First date',
      sentiment: 0.9,
      was_positive: true,
    },
    {
      id: 'date-002',
      date_type: 'first_kiss',
      date_time: '2024-01-20T00:00:00Z',
      location: 'Park',
      description: 'First kiss',
      sentiment: 0.95,
      was_positive: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders intimacy arc header and bond period', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship}
      />,
    );

    expect(screen.getByText(/intimacy & connection arc/i)).toBeInTheDocument();
    expect(screen.getByText(/bond period/i)).toBeInTheDocument();
    expect(screen.getByText(/connected since/i)).toBeInTheDocument();
  });

  it('shows ex-partners as undated timeline context', async () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship}
        useMockData
      />,
    );

    const section = await screen.findByTestId('romance-timeline-ex-partners');
    expect(section).toHaveTextContent('Their dating history');
    expect(section).toHaveTextContent('Jamie');
    expect(section).toHaveTextContent('Confirmed ex');
    expect(section).toHaveTextContent('Date not recorded');
  });

  it('opens an ex-partner Character Book card through the modal callback', async () => {
    const onOpen = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');

    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship}
        onOpenPeripheralCharacter={onOpen}
        useMockData
      />,
    );

    await userEvent.click(await screen.findByTestId('romance-timeline-ex-periph-alex-ex-jamie'));
    expect(onOpen).toHaveBeenCalledWith('romantic-periph-jamie');
  });

  it("shows Jamie's ex-husband without inventing a date", async () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-010"
        dates={[]}
        relationship={{ ...mockRelationship, id: 'rel-010', person_name: 'Jamie' }}
        useMockData
      />,
    );

    const ex = await screen.findByTestId('romance-timeline-ex-periph-jamie-ex-jordan-ellis');
    expect(ex).toHaveTextContent('Jordan Ellis');
    expect(ex).toHaveTextContent('Confirmed ex');
    expect(ex).toHaveTextContent('Time context: after they split');
    expect(ex).toHaveTextContent('Stories & context (3)');
    expect(ex).toHaveTextContent(/dated in college/i);
    expect(ex).toHaveTextContent(/ex-husband/i);
    expect(ex).toHaveTextContent(/reconnected physically/i);
  });

  it('shows ongoing badge when no end date', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship}
      />,
    );

    expect(screen.getByText(/ongoing bond/i)).toBeInTheDocument();
  });

  it('shows end date when provided', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={{
          ...mockRelationship,
          end_date: '2024-06-01T00:00:00Z',
        }}
      />,
    );

    expect(screen.getByText(/ended/i)).toBeInTheDocument();
  });

  it('renders intimacy milestones and character book link', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship}
        scores={{
          affectionScore: 0.92,
          healthScore: 0.9,
          intensityScore: 0.88,
        }}
      />,
    );

    expect(screen.getByText(/intimacy milestones/i)).toBeInTheDocument();
    expect(screen.getByTestId('romance-timeline-moment-date-001')).toBeInTheDocument();
    expect(screen.getByTestId('open-character-book-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('open-character-book-timeline')).toHaveTextContent(/story timeline/i);
  });

  it('opens Character Book Story tab via callback', async () => {
    const openSpy = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');

    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={{
          id: 'rel-001',
          person_id: 'omega-dolly',
          person_type: 'omega_entity',
          character_id: 'char-dolly',
          person_name: 'Jamie',
          start_date: '2024-01-01T00:00:00Z',
          status: 'active',
        }}
        onOpenCharacterTimeline={openSpy}
      />,
    );

    await userEvent.click(screen.getByTestId('open-character-book-timeline'));
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('hides Character Book CTA when no character link is available', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={{
          id: 'rel-001',
          person_id: 'omega-dolly',
          person_type: 'omega_entity',
          character_id: null,
          person_name: 'Jamie',
          start_date: '2024-01-01T00:00:00Z',
          status: 'active',
        }}
      />,
    );

    expect(screen.queryByTestId('open-character-book-timeline')).not.toBeInTheDocument();
  });
});

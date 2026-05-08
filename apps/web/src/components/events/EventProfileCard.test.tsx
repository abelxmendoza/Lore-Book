import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils';
import { EventProfileCard, type Event } from './EventProfileCard';

const mockEvent: Event = {
  id: 'ev-1',
  title: 'Test Event',
  summary: 'A test event summary',
  type: 'social',
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T12:00:00Z',
  confidence: 0.85,
  people: ['Alice', 'Bob'],
  locations: ['Café'],
  activities: ['coffee'],
  source_count: 2,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
};

describe('EventProfileCard', () => {
  it('renders event title', () => {
    render(<EventProfileCard event={mockEvent} />);
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('renders card with aspect-square on mobile (class present)', () => {
    const { container } = render(<EventProfileCard event={mockEvent} />);
    const card = container.querySelector('.aspect-square');
    expect(card).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<EventProfileCard event={mockEvent} onClick={onClick} />);
    const card = container.querySelector('.aspect-square') ?? screen.getByText('Test Event').parentElement;
    await user.click(card!);
    expect(onClick).toHaveBeenCalled();
  });
});
